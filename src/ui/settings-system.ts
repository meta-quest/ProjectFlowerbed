/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Settings panel (legacy SettingsSystem + ControlsPanelSystem, plus garden
 * management that used to live only on the 2D landing page).
 *
 * Opens from the tool dial's Settings tile in front of the player and stays
 * put; tabs swap pages in place. Garden deletion and replacement ask for
 * confirmation inline.
 */

import { Vector3, createSystem } from '@iwsdk/core';
import { audio } from '../core/audio.js';
import { settings, updateSettings } from '../core/settings.js';
import { activeTool, handMode, openPanel, plantCount, Tool } from '../core/state.js';
import type { GardenMeta } from '../core/storage.js';
import { activeGarden, gardenCommands, gardens, lastSaved } from '../gardening/garden-system.js';
import { placeInFront } from './follow.js';
import { albumPhotos, downloadFromAlbum, removeFromAlbum } from '../camera/photo-album.js';
import { displayCommands, displays } from '../camera/photo-display-system.js';
import {
  GOALS,
  CHAMPION_COLOR,
  MILESTONES,
  RIBBON_COLORS,
  finishOn,
  finishesOff,
  goalDone,
  isPageUnlocked,
  stats,
  toggleFinish,
  weekly,
  nextRibbonMilestone,
  weeklyDaysLeft,
  weeklyGoals,
} from '../gardening/progress.js';
import { setUiSoundsEnabled, uiDeny } from '../core/ui-sounds.js';
import { ribbonCommands } from '../world/ribbon-system.js';
import { spawnPanel, type SpawnedPanel } from './panels.js';
import { tutorialCommands } from './tutorial-system.js';

type Tab = 'garden' | 'photos' | 'goals' | 'comfort' | 'sound' | 'help';
const TABS: Tab[] = ['garden', 'photos', 'goals', 'comfort', 'sound', 'help'];
const TIMES = ['morning', 'sunset', 'night', 'auto'] as const;
const ALBUM_SLOTS = 6;
const TURN_OPTIONS = [30, 45, 60, 90];
const SPEED_OPTIONS = [2, 3, 4.5];
const ROWS = 2;
const FINISH_SLOTS = 6;
const VOLUMES = [0, 25, 50, 75, 100];
const SELECTED = { bg: '#86dc3d', text: '#10200f' };
const IDLE = { bg: '#24342c', text: '#e8efe9' };

const ago = (time: number): string => {
  if (!time) return 'not saved yet';
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 10) return 'saved just now';
  if (seconds < 60) return `saved ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `saved ${minutes} min ago`;
  return `saved ${new Date(time).toLocaleDateString()}`;
};

export class SettingsSystem extends createSystem({}) {
  private panel: SpawnedPanel | null = null;
  private tab: Tab = 'garden';
  private rowGardens: (GardenMeta | null)[] = [];
  private confirm: { kind: 'delete'; id: string } | null = null;
  private refreshTimer = 0;
  private anchor = new Vector3();
  private albumPage = 0;
  private albumSelected: string | null = null;
  private albumThumbs: string[] = [];
  private viewerThumb = '';
  private goalSet: 'tools' | 'garden' | 'weekly' = 'tools';
  private deleteArmed: string | null = null;
  private deleteTimer = 0;
  private viewerAspect = new Map<string, number>();

  override init(): void {
    void spawnPanel(this.world, 'settings', { scale: 0.145 }).then((panel) => {
      this.panel = panel;
      panel.show(false);
      this.wire(panel);
      this.render();
    });
    // Opening renders every section, so a closed panel skips updates (UIKit
    // text layout costs milliseconds on Quest; gameplay changes stats often).
    const whileOpen = (run: () => void) => () => {
      if (openPanel.peek() === 'settings') run();
    };
    this.cleanupFuncs.push(
      openPanel.subscribe((value) => this.setOpen(value === 'settings')),
      settings.subscribe(whileOpen(() => this.render())),
      gardens.subscribe(whileOpen(() => this.render())),
      activeGarden.subscribe(whileOpen(() => this.render())),
      plantCount.subscribe(whileOpen(() => this.renderHeader())),
      albumPhotos.subscribe(whileOpen(() => this.renderAlbum())),
      finishesOff.subscribe(whileOpen(() => this.renderGoals())),
      weekly.subscribe(whileOpen(() => this.renderGoals())),
      handMode.subscribe(whileOpen(() => this.render())),
      displays.subscribe(whileOpen(() => this.renderAlbum())),
      stats.subscribe(
        whileOpen(() => {
          this.renderProgress();
          this.renderGoals();
        }),
      ),
    );
    audio.onMusicTrack(whileOpen(() => this.render()));
  }

  private wire(panel: SpawnedPanel): void {
    const off = (fn: () => void) => this.cleanupFuncs.push(fn);
    off(panel.on('settings-close', 'click', () => (openPanel.value = 'none')));
    for (const tab of TABS) {
      off(
        panel.on(`tab-${tab}`, 'click', () => {
          this.tab = tab;
          this.confirm = null;
          this.render();
        }),
      );
    }
    for (let slot = 0; slot < FINISH_SLOTS; slot++) {
      off(
        panel.on(`goal-${slot + MILESTONES.length}-equip`, 'click', () => {
          const goal = this.setGoals()[slot];
          if (goal && goalDone(goal.id)) toggleFinish(goal.id);
          else uiDeny();
        }),
      );
    }
    for (const set of ['tools', 'garden', 'weekly'] as const) {
      off(
        panel.on(`goals-set-${set}`, 'click', () => {
          this.goalSet = set;
          this.renderGoals();
        }),
      );
    }
    // In the viewer, step through every photo.
    const step = (by: number) => {
      const photos = albumPhotos.peek();
      const index = photos.findIndex((p) => p.id === this.albumSelected);
      if (index < 0 || photos.length < 2) return;
      const next = (index + by + photos.length) % photos.length;
      this.albumSelected = photos[next].id;
      this.albumPage = Math.floor(next / ALBUM_SLOTS);
      this.renderAlbum();
    };
    off(panel.on('album-view-prev', 'click', () => step(-1)));
    off(panel.on('album-view-next', 'click', () => step(1)));
    off(panel.on('garden-save', 'click', () => gardenCommands.saveNow()));
    off(
      panel.on('garden-new', 'click', () => {
        gardenCommands.create();
        this.confirm = null;
      }),
    );
    for (let i = 0; i < ROWS; i++) {
      off(
        panel.on(`garden-row-${i}-open`, 'click', () => {
          const garden = this.rowGardens[i];
          if (garden) gardenCommands.open(garden.id);
        }),
      );
      off(
        panel.on(`garden-row-${i}-delete`, 'click', () => {
          const garden = this.rowGardens[i];
          if (!garden) return;
          this.confirm = { kind: 'delete', id: garden.id };
          this.render();
        }),
      );
    }
    off(
      panel.on('garden-confirm-yes', 'click', () => {
        if (this.confirm) gardenCommands.remove(this.confirm.id);
        this.confirm = null;
        this.render();
      }),
    );
    off(
      panel.on('garden-confirm-no', 'click', () => {
        this.confirm = null;
        this.render();
      }),
    );
    for (const angle of TURN_OPTIONS) {
      off(panel.on(`turn-${angle}`, 'click', () => updateSettings({ snapTurnDeg: angle })));
    }
    for (const speed of SPEED_OPTIONS) {
      off(panel.on(`speed-${speed}`, 'click', () => updateSettings({ moveSpeed: speed })));
    }
    panel.style('toggle-vignette', {
      onCheckedChange: (checked: boolean) => updateSettings({ vignette: checked }),
    });
    panel.style('toggle-music', {
      // Turning music back on after "Off" restores a sensible volume.
      onCheckedChange: (checked: boolean) =>
        updateSettings(
          checked && settings.peek().musicVolume === 0 ? { music: true, musicVolume: 0.75 } : { music: checked },
        ),
    });
    for (const level of VOLUMES) {
      off(
        panel.on(`music-vol-${level}`, 'click', () => updateSettings({ musicVolume: level / 100, music: level > 0 })),
      );
      off(panel.on(`effects-vol-${level}`, 'click', () => updateSettings({ effectsVolume: level / 100 })));
    }
    panel.style('toggle-uisounds', {
      onCheckedChange: (checked: boolean) => updateSettings({ uiSounds: checked }),
    });
    panel.style('toggle-blink', {
      onCheckedChange: (checked: boolean) => updateSettings({ blinkFade: checked }),
    });
    off(
      panel.on('comfort-reset', 'click', () =>
        updateSettings({ vignette: false, snapTurnDeg: 45, turnStyle: 'snap', moveSpeed: 3, blinkFade: true }),
      ),
    );
    off(panel.on('music-next', 'click', () => audio.nextTrack()));
    for (const time of TIMES) {
      off(panel.on(`time-${time}`, 'click', () => updateSettings({ timeOfDay: time })));
    }
    for (let i = 0; i < ALBUM_SLOTS; i++) {
      off(
        panel.on(`album-${i}`, 'click', () => {
          const photo = albumPhotos.peek()[this.albumPage * ALBUM_SLOTS + i];
          // Open the photo full size.
          if (photo) this.albumSelected = photo.id;
          this.renderAlbum();
        }),
      );
    }
    off(
      panel.on('album-camera', 'click', () => {
        openPanel.value = 'none';
        activeTool.value = Tool.Camera;
      }),
    );
    off(
      panel.on('album-prev', 'click', () => {
        this.albumPage = Math.max(0, this.albumPage - 1);
        this.renderAlbum();
      }),
    );
    off(
      panel.on('album-next', 'click', () => {
        const pages = Math.ceil(albumPhotos.peek().length / ALBUM_SLOTS);
        this.albumPage = Math.min(Math.max(pages - 1, 0), this.albumPage + 1);
        this.renderAlbum();
      }),
    );
    off(
      panel.on('album-download', 'click', () => {
        if (this.albumSelected) void downloadFromAlbum(this.albumSelected);
      }),
    );
    off(
      panel.on('album-delete', 'click', () => {
        const id = this.albumSelected;
        if (!id) return;
        // Two taps: the first arms the button for a few seconds.
        if (this.deleteArmed !== id) {
          this.deleteArmed = id;
          this.deleteTimer = 3;
          panel.text('album-delete-label', 'Tap to confirm');
          panel.text(
            'album-count',
            displays.peek().some((d) => d.photoId === id)
              ? 'Delete this photo? Its easel in the garden will be taken down too.'
              : 'Delete this photo? Tap again to confirm.',
          );
          return;
        }
        this.deleteArmed = null;
        panel.text('album-delete-label', 'Delete');
        const photos = albumPhotos.peek();
        const index = photos.findIndex((p) => p.id === id);
        const next = photos[index + 1] ?? photos[index - 1] ?? null;
        displayCommands.remove(id);
        void removeFromAlbum(id);
        this.albumSelected = next?.id ?? null;
        this.renderAlbum();
      }),
    );
    off(
      panel.on('weekly-visit', 'click', () => {
        openPanel.value = 'none';
        ribbonCommands.visitGazebo();
      }),
    );
    off(
      panel.on('album-tour', 'click', () => {
        openPanel.value = 'none';
        displayCommands.tour();
      }),
    );
    off(
      panel.on('album-goto', 'click', () => {
        if (!this.albumSelected) return;
        openPanel.value = 'none';
        displayCommands.visit(this.albumSelected);
      }),
    );
    for (const style of ['snap', 'smooth'] as const) {
      off(panel.on(`turnstyle-${style}`, 'click', () => updateSettings({ turnStyle: style })));
    }
    off(
      panel.on('album-back', 'click', () => {
        this.albumSelected = null;
        this.renderAlbum();
      }),
    );
    off(
      panel.on('album-display', 'click', () => {
        const id = this.albumSelected;
        if (!id) return;
        if (displays.peek().some((d) => d.photoId === id)) displayCommands.remove(id);
        else {
          displayCommands.show(id);
          openPanel.value = 'none';
        }
        this.renderAlbum();
      }),
    );
    off(
      panel.on('help-tutorial', 'click', () => {
        openPanel.value = 'none';
        tutorialCommands.restart();
      }),
    );
  }

  private setOpen(open: boolean): void {
    if (!this.panel) return;
    if (open) {
      placeInFront(this.world, this.panel.root, 1.0, -0.2);
      this.panel.root.getWorldPosition(this.anchor);
      this.confirm = null;
      this.render();
    }
    this.panel.show(open);
  }

  override update(delta: number): void {
    if (!this.panel || openPanel.peek() !== 'settings') return;
    // Close if the player wanders off (e.g. teleports away).
    this.world.player.head.getWorldPosition(tmp);
    if (tmp.distanceTo(this.anchor) > 3) openPanel.value = 'none';
    if (this.deleteArmed && (this.deleteTimer -= delta) <= 0) {
      this.deleteArmed = null;
      this.panel?.text('album-delete-label', 'Delete');
    }
    this.refreshTimer += delta;
    if (this.refreshTimer > 1) {
      this.refreshTimer = 0;
      this.renderHeader();
    }
  }

  private renderProgress(): void {
    const panel = this.panel;
    if (!panel) return;
    const unlocked = 1 + MILESTONES.filter((m) => isPageUnlocked(m.page)).length;
    const total = 1 + MILESTONES.length;
    panel.text('progress-title', `Seed collection - ${unlocked} of ${total} pages`);
    const next = MILESTONES.find((m) => !isPageUnlocked(m.page));
    const have = next ? stats.peek()[next.stat] : 0;
    panel.text(
      'progress-next',
      next ? `Next: ${next.task} (${have} / ${next.goal})` : 'Every seed is yours. Happy gardening!',
    );
    panel.style('progress-fill', {
      width: Math.round(((unlocked - 1 + (next ? have / next.goal : 0)) / (total - 1)) * 536),
    });
  }

  private setGoals() {
    return GOALS.filter((goal) => goal.set === this.goalSet);
  }

  private renderGoals(): void {
    const panel = this.panel;
    if (!panel) return;
    const values = stats.peek();
    const bar = (i: number, have: number, goal: number) => {
      const done = have >= goal;
      panel.text(`goal-${i}-count`, done ? 'Done' : `${Math.min(have, goal)} / ${goal}`);
      panel.style(`goal-${i}-count`, { color: done ? '#86dc3d' : '#f6c443' });
      panel.style(`goal-${i}-fill`, {
        width: Math.round(154 * Math.min(1, have / goal)),
        backgroundColor: done ? '#86dc3d' : '#f6c443',
      });
    };
    MILESTONES.forEach((m, i) => {
      panel.text(`goal-${i}-title`, m.task);
      panel.text(`goal-${i}-reward`, `Unlocks ${m.reward.toLowerCase()}`);
      panel.style(`goal-${i}-dot`, { backgroundColor: values[m.stat] >= m.goal ? '#86dc3d' : '#2f4639' });
      bar(i, values[m.stat], m.goal);
    });
    for (const set of ['tools', 'garden', 'weekly'] as const) this.chip(`goals-set-${set}`, this.goalSet === set);
    const earned = GOALS.filter((g) => goalDone(g.id)).length;
    panel.text('goals-section', this.goalSet === 'weekly' ? 'This week' : 'Finishes');
    const ribbons = weekly.peek().ribbons;
    const weeklyView = this.goalSet === 'weekly';
    panel.style('weekly-strip', { display: weeklyView ? 'flex' : 'none' });
    if (weeklyView) {
      const left = weeklyDaysLeft();
      panel.text('goals-master', `${ribbons} ribbon${ribbons === 1 ? '' : 's'} won`);
      panel.style('goals-master', { color: ribbons ? '#f6c443' : '#a9bcb0' });
      panel.text('weekly-left', `${left} day${left === 1 ? '' : 's'} left`);
      panel.text('weekly-title', ribbons ? `Your ribbons (${ribbons})` : 'Weekly ribbons');
      const next = nextRibbonMilestone(ribbons);
      panel.text(
        'weekly-hint',
        next ? `Next at ${next.at} ribbons: ${next.title.toLowerCase()}` : 'Grand Champion - every reward unlocked',
      );
      panel.style('weekly-visit', { display: ribbons > 0 ? 'flex' : 'none' });
      for (let n = 0; n < 12; n++) {
        panel.style(`weekly-ribbon-${n}`, {
          color:
            n < ribbons ? ((n + 1) % 5 === 0 ? CHAMPION_COLOR : RIBBON_COLORS[n % RIBBON_COLORS.length]) : '#3a4d42',
        });
      }
    } else {
      panel.text(
        'goals-master',
        earned >= GOALS.length ? 'Golden gloves earned!' : `All 12: golden gloves (${earned} / ${GOALS.length})`,
      );
      panel.style('goals-master', { color: earned >= GOALS.length ? '#f6c443' : '#a9bcb0' });
    }
    const cards =
      this.goalSet === 'weekly'
        ? weeklyGoals().map((w) => ({
            title: w.title,
            reward: w.done ? 'Done this week' : w.hint,
            icon: w.icon,
            have: w.have,
            goal: w.goal,
            done: w.done || w.have >= w.goal,
            goal_: null as (typeof GOALS)[number] | null,
          }))
        : this.setGoals().map((g) => ({
            title: g.title,
            reward: g.reward,
            icon: null as string | null,
            have: values[g.stat],
            goal: g.goal,
            done: goalDone(g.id),
            goal_: g,
          }));
    for (let slot = 0; slot < FINISH_SLOTS; slot++) {
      const i = slot + MILESTONES.length;
      const card = cards[slot];
      panel.style(`goal-${i}`, { display: card ? 'flex' : 'none' });
      if (!card) continue;
      const goal = card.goal_;
      const on = goal ? finishOn(goal.id) : false;
      panel.text(`goal-${i}-title`, card.title);
      panel.text(`goal-${i}-reward`, card.reward);
      const color = goal?.color ?? '#f6c443';
      panel.style(`goal-${i}-reward`, { color: card.done ? color : '#a9bcb0', fontWeight: card.done ? 700 : 400 });
      bar(i, card.have, card.goal);
      // The reward's icon in its finish colour once earned; a lock until then.
      for (const set of ['tools', 'garden'] as const) {
        panel.style(`goal-${i}-icon-${set}`, {
          display: set === this.goalSet ? 'flex' : 'none',
          color: card.done ? color : '#6f8277',
        });
      }
      if (slot < 3) {
        for (const kind of ['sprout', 'water', 'camera'] as const) {
          panel.style(`goal-${i}-icon-w-${kind}`, {
            display: weeklyView && card.icon === kind ? 'flex' : 'none',
            color: card.done ? '#f6c443' : '#c9d6ce',
          });
        }
      }
      panel.style(`goal-${i}-badge`, { backgroundColor: card.done ? '#2c3d33' : '#1f2b25' });
      panel.style(`goal-${i}-lock`, { display: card.done || !goal ? 'none' : 'flex' });
      panel.style(`goal-${i}-equip`, {
        display: card.done && goal ? 'flex' : 'none',
        backgroundColor: on ? SELECTED.bg : IDLE.bg,
        hover: { backgroundColor: on ? SELECTED.bg : '#2f4639' },
      });
      panel.text(`goal-${i}-equip-label`, on ? 'Equipped' : 'Equip');
      panel.style(`goal-${i}-equip-label`, { color: on ? SELECTED.text : IDLE.text });
    }
  }

  private renderAlbum(): void {
    const panel = this.panel;
    if (!panel) return;
    const photos = albumPhotos.peek();
    const pages = Math.max(1, Math.ceil(photos.length / ALBUM_SLOTS));
    this.albumPage = Math.min(this.albumPage, pages - 1);
    const selected = photos.find((p) => p.id === this.albumSelected) ?? null;
    if (!selected) this.albumSelected = null;
    // Viewer: one photo, large, with its actions.
    panel.style('album-viewer', { display: selected ? 'flex' : 'none' });
    panel.style('album-grid', { display: selected || !photos.length ? 'none' : 'flex' });
    panel.style('album-pager', { display: !selected && pages > 1 ? 'flex' : 'none' });
    panel.style('album-view-prev', { display: photos.length > 1 ? 'flex' : 'none' });
    panel.style('album-tour', { display: !selected && displays.peek().length > 0 ? 'flex' : 'none' });
    panel.style('album-view-next', { display: photos.length > 1 ? 'flex' : 'none' });
    panel.style('album-empty', { display: photos.length ? 'none' : 'flex' });
    panel.text(
      'album-count',
      selected
        ? 'Display it on an easel in front of you, download it, or delete it.'
        : photos.length
          ? `${photos.length} photo${photos.length === 1 ? '' : 's'} - page ${this.albumPage + 1} of ${pages}. Select one to view it.`
          : 'Photos you keep from the camera live here.',
    );
    if (selected) {
      if (this.viewerThumb !== selected.thumb) {
        this.viewerThumb = selected.thumb;
        panel.style('album-view', { src: selected.thumb });
      }
      // Fit the print inside the viewer box, centred, at its true shape.
      const aspect = this.viewerAspect.get(selected.id);
      if (aspect == null) {
        const image = new Image();
        image.onload = () => {
          this.viewerAspect.set(selected.id, image.width / image.height);
          this.renderAlbum();
        };
        image.src = selected.thumb;
      } else {
        const height = Math.min(300, 568 / aspect);
        panel.style('album-view', { width: Math.round(height * aspect), height: Math.round(height) });
      }
      if (this.deleteArmed && this.deleteArmed !== selected.id) {
        this.deleteArmed = null;
        panel.text('album-delete-label', 'Delete');
      }
      panel.style('album-goto', { display: displays.peek().some((d) => d.photoId === selected.id) ? 'flex' : 'none' });
      const index = photos.indexOf(selected) + 1;
      const garden = gardens.peek().find((g) => g.id === selected.gardenId)?.name ?? 'A garden';
      panel.text(
        'album-view-date',
        `${index} of ${photos.length} - ${garden}, ${new Date(selected.created).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`,
      );
      const shown = displays.peek().some((d) => d.photoId === selected.id);
      panel.text('album-display-label', shown ? 'Take down' : 'Display in garden');
    }
    for (let i = 0; i < ALBUM_SLOTS; i++) {
      const photo = photos[this.albumPage * ALBUM_SLOTS + i];
      panel.style(`album-${i}`, { display: photo ? 'flex' : 'none' });
      if (photo && this.albumThumbs[i] !== photo.thumb) {
        this.albumThumbs[i] = photo.thumb;
        panel.style(`album-${i}`, { src: photo.thumb });
      }
    }
  }

  private renderHeader(): void {
    const panel = this.panel;
    const garden = activeGarden.peek();
    if (!panel || !garden) return;
    const count = plantCount.peek();
    const plants = `${count} plant${count === 1 ? '' : 's'}`;
    const champion = weekly.peek().ribbons >= 20 ? ' - Grand Champion' : '';
    panel.text('settings-subtitle', `${garden.name}${champion} - ${plants}`);
    panel.text('garden-current-name', garden.name);
    panel.text('garden-current-meta', `${plants} - ${ago(lastSaved.peek() || garden.updated)}`);
    const values = stats.peek();
    panel.text('stat-plants', String(count));
    panel.text('stat-varieties', String(values.varietyCount));
    panel.text('stat-photos', String(albumPhotos.peek().length));
    panel.text('stat-finishes', `${GOALS.filter((g) => goalDone(g.id)).length} / ${GOALS.length}`);
  }

  /** Selected chips are solid leaf green with dark text, like the tabs. */
  private chip(id: string, selected: boolean): void {
    const look = selected ? SELECTED : IDLE;
    this.panel?.style(id, { backgroundColor: look.bg, hover: { backgroundColor: selected ? look.bg : '#2f4639' } });
    this.panel?.style(`${id}-label`, { color: look.text });
  }

  private render(): void {
    const panel = this.panel;
    if (!panel) return;
    for (const tab of TABS) {
      const active = tab === this.tab;
      panel.style(`page-${tab}`, { display: active ? 'flex' : 'none' });
      // Active tab: solid leaf green with dark text, unmistakable at a glance.
      // UIKit can keep :hover after a click, so the hover colour carries the
      // selection too.
      panel.style(`tab-${tab}`, {
        backgroundColor: active ? '#86dc3d' : '#1a2620',
        hover: { backgroundColor: active ? '#86dc3d' : '#24342c' },
      });
      panel.style(`tab-${tab}-label`, { color: active ? '#10200f' : '#c9d6ce' });
    }
    for (const time of TIMES) this.chip(`time-${time}`, (settings.peek().timeOfDay ?? 'sunset') === time);
    this.renderProgress();
    this.renderGoals();
    this.renderAlbum();
    this.renderHeader();

    // Garden list: other gardens, newest first.
    const current = activeGarden.peek();
    const others = gardens.peek().filter((garden) => garden.id !== current?.id);
    this.rowGardens = [];
    for (let i = 0; i < ROWS; i++) {
      const garden = others[i] ?? null;
      this.rowGardens.push(garden);
      panel.style(`garden-row-${i}`, { display: garden ? 'flex' : 'none' });
      if (garden) {
        panel.text(`garden-row-${i}-name`, garden.name);
        panel.text(
          `garden-row-${i}-meta`,
          `${garden.plants} plants - ${new Date(garden.updated).toLocaleDateString()}`,
        );
      }
    }
    panel.style('garden-list-title', { display: others.length ? 'flex' : 'none' });
    panel.style('garden-empty', { display: others.length ? 'none' : 'flex' });
    panel.style('garden-confirm', { display: this.confirm ? 'flex' : 'none' });
    if (this.confirm) {
      const name = gardens.peek().find((garden) => garden.id === this.confirm!.id)?.name ?? 'this garden';
      panel.text('garden-confirm-title', `Delete ${name}?`);
    }

    const value = settings.peek();
    panel.style('toggle-vignette', { checked: value.vignette });
    panel.style('toggle-music', { checked: value.music });
    const nearest = (v: number) => VOLUMES.reduce((a, b) => (Math.abs(b - v * 100) < Math.abs(a - v * 100) ? b : a));
    for (const level of VOLUMES) {
      this.chip(`music-vol-${level}`, (value.music ? nearest(value.musicVolume) : 0) === level);
      this.chip(`effects-vol-${level}`, nearest(value.effectsVolume) === level);
    }
    panel.style('toggle-uisounds', { checked: value.uiSounds !== false });
    panel.style('toggle-blink', { checked: value.blinkFade !== false });
    setUiSoundsEnabled(value.uiSounds !== false);
    for (const angle of TURN_OPTIONS) this.chip(`turn-${angle}`, value.snapTurnDeg === angle);
    for (const style of ['snap', 'smooth'] as const)
      this.chip(`turnstyle-${style}`, (value.turnStyle ?? 'snap') === style);
    panel.style('turn-angles', { opacity: value.turnStyle === 'smooth' ? 0.35 : 1 });

    for (const speed of SPEED_OPTIONS) this.chip(`speed-${speed}`, value.moveSpeed === speed);
    panel.text('music-now', `Now playing: ${audio.currentTrackTitle}`);
    // Help shows the controls for whatever is in use.
    panel.style('help-controllers', { display: handMode.peek() ? 'none' : 'flex' });
    panel.style('help-hands', { display: handMode.peek() ? 'flex' : 'none' });
  }
}

const tmp = new Vector3();
