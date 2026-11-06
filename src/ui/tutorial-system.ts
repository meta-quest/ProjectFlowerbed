/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * First-run tutorial and contextual tips (legacy NUXSystem, HandNUXSystem,
 * Seedbox/CameraHandContextualNUX and the progressive tooltip systems).
 *
 * Tutorial steps and completion rules follow the legacy NUX exactly:
 *   welcome -> getting around -> (teleport or glide 3 m, 40 s fallback) ->
 *   planting seeds -> open the dial (A) -> choose Seeds -> plant a seed
 *   (Sugar Pine preselected) -> closing tips -> done.
 * "Continue" waits 1 s before the next step, and while the tutorial runs
 * only the Seeds tile works. It runs in XR, once, unless replayed.
 */

import { SlideSystem, Vector3, VisibilityState, createSystem, signal } from '@iwsdk/core';
import { photoEvents, shutterButton } from '../camera/camera-system.js';
import { selectDown } from '../core/input.js';
import {
  activeTool,
  dialLocked,
  handMode,
  isToolLive,
  seedboxPage,
  seedPagingHint,
  selectedPlant,
  Tool,
  toolDialOpen,
  tutorialActive,
} from '../core/state.js';
import { hasFlag, setFlag, type HintFlag } from '../core/storage.js';
import { PLANT_INDEX, SLOTS_PER_PAGE } from '../data/plants.js';
import { plantedListeners } from '../gardening/planting-system.js';
import { seedboxObject } from '../gardening/seedbox-system.js';
import { showControllerModel } from '../world/hands-system.js';
import { teleportCount } from '../world/island-state.js';
import { GazeFollower } from './follow.js';
import { ButtonBeacon, GlowPulse, HintBubble, type HintContent } from './hints.js';
import { spawnPanel, type SpawnedPanel } from './panels.js';
import type { Mesh } from '@iwsdk/core';
import { holdTeleport, holdTurning } from '../core/locomotion-holds.js';

const Step = {
  BeforeStart: 0,
  Welcome: 1,
  Locomotion: 2,
  Seedbox: 3,
  Closing: 4,
  Waiting: 5,
  MoveTo: 6,
  OpenMenu: 7,
  OpenSeedbox: 8,
  PlantSeed: 9,
  Ended: 99,
} as const;
type Step = (typeof Step)[keyof typeof Step];

interface Card {
  step: number;
  eyebrow: string;
  title: string;
  body: string;
  /** Wording for tracked hands. */
  handBody?: string;
  video: string | null;
  next: string;
  skip: boolean;
  tips?: boolean;
}

const video = (file: string) => `${import.meta.env.BASE_URL}flowerbed/videos/${file}`;
/** The legacy welcome and outro clips were byte-identical copies of the trailer. */
const TRAILER = 'sizzle_trailer.mp4';

const CARDS: Partial<Record<Step, Card>> = {
  [Step.Welcome]: {
    step: 0,
    eyebrow: 'WELCOME',
    title: 'Welcome to Project Flowerbed',
    body: 'Bring the garden of your dreams to life on a quiet island. Here is a quick tour of the basics of VR gardening.',
    video: video(TRAILER),
    next: 'Start tutorial',
    skip: true,
  },
  [Step.Locomotion]: {
    step: 1,
    eyebrow: 'STEP 1 - GETTING AROUND',
    title: 'Getting around',
    body: 'Push the right stick forward, aim the arc at a path and let go to teleport. Glide with the left stick, and flick the right stick sideways to turn.',
    handBody:
      'Swipe your right thumb forward along your index finger to show the arc, aim it at a path, then tap your thumb to teleport. Swipe back to cancel, or left and right to turn.',
    video: video('Teleport.mp4'),
    next: 'Continue',
    skip: true,
  },
  [Step.Seedbox]: {
    step: 2,
    eyebrow: 'STEP 2 - PLANTING',
    title: 'Planting seeds',
    body: 'Great job! Your seedbox lives on your left wrist. Open the tool dial, choose Seeds, then aim and release the trigger to plant.',
    handBody:
      'Great job! Turn the inside of your left wrist toward you and tap the Tools button to open the dial. Choose Seeds, pinch a packet in the seedbox, then aim and pinch to plant.',
    video: video('Plant.mp4'),
    next: 'Continue',
    skip: true,
  },
  [Step.Closing]: {
    step: 3,
    eyebrow: 'ALL SET',
    title: "Let's get gardening",
    body: 'That is the basics. A few final tips:',
    video: video(TRAILER),
    next: 'Finish',
    skip: false,
    tips: true,
  },
};

export const tutorialStep = signal<number>(Step.Ended);

const FIRST_USE: Partial<Record<Tool, { flag: HintFlag; content: HintContent }>> = {
  water: {
    flag: 'seenWaterTip',
    content: {
      key: 'Hold',
      title: 'Watering',
      text: 'Hold the trigger. Thirsty plants perk up, and watered plants grow bigger.',
      hand: { key: 'Pinch', text: 'Pinch and hold to pour. Thirsty plants perk up, and watered plants grow bigger.' },
    },
  },
  remove: {
    flag: 'seenRemoveTip',
    content: {
      key: 'Hold',
      title: 'Removing',
      text: 'Point at a plant and hold the trigger until the ring fills.',
      hand: { key: 'Pinch', text: 'Point at a plant, then pinch and hold until the ring fills.' },
    },
  },
  camera: {
    flag: 'seenCameraTip',
    content: {
      key: 'Trigger',
      title: 'Camera',
      text: 'Pull the trigger to shoot, X / Y to zoom. Grab a print with the left trigger and drop it on Keep or Discard.',
      hand: { key: 'Pinch', text: 'Pinch to shoot. Pinch a print with your left hand and drop it on Keep or Discard.' },
    },
  },
};
export const tutorialCommands = { restart: () => {} };

export class TutorialSystem extends createSystem({}) {
  private card: SpawnedPanel | null = null;
  private follower: GazeFollower | null = null;
  private hint!: HintBubble;
  private tip!: HintBubble;
  private step: Step = Step.Ended;
  private stepTime = 0;
  private pending: { step: Step; at: number } | null = null;
  private cardStep: Step | null = null;
  private cardShowAt = 0;
  private elapsed = 0;
  private teleportsAtStart = 0;
  private glideStart = new Vector3();
  private savedSelection: { page: number; plant: number } | null = null;
  private wantsStart = false;
  // Contextual tips
  private seedboxGlow!: GlowPulse;
  private shutterGlow!: GlowPulse;
  private seedsEntries = 0;
  private cameraEntries = 0;
  private wasSeeds = false;
  private wasCamera = false;
  private v = new Vector3();

  override init(): void {
    this.hint = new HintBubble(this.world);
    this.tip = new HintBubble(this.world);
    this.seedboxGlow = new GlowPulse(this.world, 'left');
    this.shutterGlow = new GlowPulse(this.world, 'right');
    this.aButtonGlow = new ButtonBeacon(this.world);
    void spawnPanel(this.world, 'tutorial', { scale: 0.185 }).then((panel) => {
      this.card = panel;
      this.follower = new GazeFollower(panel.root, 1.4, -0.12);
      panel.show(false);
      this.cleanupFuncs.push(
        panel.on('tutorial-skip', 'click', () => this.setStep(Step.Ended)),
        panel.on('tutorial-next', 'click', () => this.advance()),
      );
    });
    tutorialCommands.restart = () => {
      this.wantsStart = true;
    };
    this.wantsStart = !hasFlag('seenTutorial');
    const onPlanted = () => {
      if (this.step === Step.PlantSeed) this.setStep(Step.Closing);
    };
    plantedListeners.add(onPlanted);
    const onPhoto = (event: 'taken' | 'printed' | 'cleared') => this.onPhotoEvent(event);
    photoEvents.listeners.add(onPhoto);
    this.cleanupFuncs.push(
      () => plantedListeners.delete(onPlanted),
      () => photoEvents.listeners.delete(onPhoto),
    );
  }

  override update(delta: number): void {
    this.elapsed += delta;
    this.stepTime += delta;
    this.hint.update(delta);
    this.tip.update(delta);
    const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (this.wantsStart && inXR && this.card) {
      this.wantsStart = false;
      this.setStep(Step.BeforeStart);
    }
    if (this.pending && this.elapsed >= this.pending.at) {
      const next = this.pending.step;
      this.pending = null;
      this.setStep(next);
    }
    this.updateCard(delta);
    this.updateStep();
    this.updateContextualTips(delta);
  }

  // Tutorial ---------------------------------------------------------------

  private setStep(step: Step): void {
    const previous = this.step;
    this.step = step;
    this.stepTime = 0;
    this.pending = null;
    tutorialStep.value = step;
    tutorialActive.value = step !== Step.Ended;
    // Reveal the real controller while teaching the A button (legacy HandNUX).
    showControllerModel.value = step === Step.OpenMenu;
    // Legacy NUX keeps the menu off until it teaches it.
    dialLocked.value =
      step !== Step.Ended && step !== Step.OpenMenu && step !== Step.OpenSeedbox && step !== Step.PlantSeed;
    this.aButtonGlow.stop();
    this.aBeaconPending = false;
    if (step === Step.OpenMenu) this.attachAButtonGlow();
    this.hint.hide();

    switch (step) {
      case Step.BeforeStart:
        activeTool.value = Tool.Explore;
        this.setLocomotion(false);
        this.pending = { step: Step.Welcome, at: this.elapsed + 1 };
        break;
      case Step.MoveTo:
        this.setLocomotion(true);
        this.teleportsAtStart = teleportCount.peek();
        this.world.player.getWorldPosition(this.glideStart);
        this.pending = { step: Step.Seedbox, at: this.elapsed + 40 };
        this.hint.show(
          {
            key: 'Stick',
            title: 'Teleport',
            text: 'Push the right stick forward and release to teleport.',
            hand: { key: 'Swipe', text: 'Swipe your right thumb forward to aim, then tap your thumb to teleport.' },
          },
          this.world.player.gripSpaces.right,
          [0.08, 0.2, -0.12],
        );
        break;
      case Step.OpenMenu:
        this.hint.show(
          {
            key: 'A',
            title: 'Open the tool dial',
            text: 'Press the A button on your right controller.',
            hand: { key: 'Palm', text: 'Turn your left palm toward you and tap the Tools button.' },
          },
          this.world.player.gripSpaces.right,
          [0.08, 0.2, -0.12],
        );
        break;
      case Step.OpenSeedbox:
        this.hint.show(
          { key: 'Seeds', title: 'Select seeds', text: 'Choose the Seeds tile at the top of the dial.' },
          this.world.player.gripSpaces.right,
          [0, 0.36, -0.08],
        );
        break;
      case Step.PlantSeed:
        this.savedSelection = { page: seedboxPage.peek(), plant: selectedPlant.peek() };
        selectedPlant.value = PLANT_INDEX.get('sugarpine') ?? 0;
        seedboxPage.value = Math.floor(selectedPlant.peek() / SLOTS_PER_PAGE);
        this.hint.show(
          {
            key: 'Trigger',
            title: 'Plant a seed',
            text: 'Point at the grass, then pull and release the right trigger.',
            hand: { key: 'Pinch', text: 'Point at the grass and pinch to plant.' },
          },
          this.world.player.gripSpaces.right,
          [0.08, 0.2, -0.12],
        );
        break;
      case Step.Ended:
        this.setLocomotion(true);
        if (previous !== Step.Ended) setFlag('seenTutorial');
        if (this.savedSelection) {
          seedboxPage.value = this.savedSelection.page;
          selectedPlant.value = this.savedSelection.plant;
          this.savedSelection = null;
        }
        break;
    }

    // Cards: Seedbox after 2 s, Closing after 5 s (legacy delays).
    const card = CARDS[step];
    if (card) {
      const delay = step === Step.Seedbox ? 2 : step === Step.Closing ? 5 : 0;
      this.cardStep = step;
      this.cardShowAt = this.elapsed + delay;
      if (step !== Step.Closing && step !== Step.Seedbox) activeTool.value = Tool.Explore;
    } else {
      this.cardStep = null;
    }
    if (!card) this.card?.show(false);
  }

  private advance(): void {
    const next: Partial<Record<Step, Step>> = {
      [Step.Welcome]: Step.Locomotion,
      [Step.Locomotion]: Step.MoveTo,
      [Step.Seedbox]: Step.OpenMenu,
      [Step.Closing]: Step.Ended,
    };
    const target = next[this.step];
    if (target == null) return;
    this.setStep(Step.Waiting);
    this.pending = { step: target, at: this.elapsed + 1 };
  }

  private updateCard(delta: number): void {
    const panel = this.card;
    if (!panel || !this.follower) return;
    if (this.cardStep == null || this.elapsed < this.cardShowAt) {
      if (panel.shown) panel.show(false);
      return;
    }
    const card = CARDS[this.cardStep]!;
    if (!panel.shown) {
      panel.text('tutorial-step', card.eyebrow);
      panel.text('tutorial-title', card.title);
      panel.text('tutorial-body', handMode.peek() && card.handBody ? card.handBody : card.body);
      panel.text('tutorial-next-label', card.next);
      panel.style('tutorial-skip', { display: card.skip ? 'flex' : 'none' });
      panel.style('tutorial-tips', { display: card.tips ? 'flex' : 'none' });
      panel.style('tutorial-video', card.video ? { display: 'flex', src: card.video } : { display: 'none' });
      for (let i = 0; i < 4; i++) {
        panel.style(`tutorial-dot-${i}`, { backgroundColor: i <= card.step ? '#86dc3d' : '#2f4639' });
      }
      this.follower.reset();
      panel.show(true);
    }
    this.follower.update(this.world, delta);
  }

  private updateStep(): void {
    switch (this.step) {
      case Step.MoveTo: {
        this.world.player.getWorldPosition(this.v);
        const glided = this.v.distanceToSquared(this.glideStart) > 9;
        if (teleportCount.peek() > this.teleportsAtStart || glided) this.setStep(Step.Seedbox);
        break;
      }
      case Step.OpenMenu:
        // The A-button beacon pulses haptics itself.
        if (toolDialOpen.peek()) this.setStep(Step.OpenSeedbox);
        break;
      case Step.OpenSeedbox:
        if (!toolDialOpen.peek()) {
          this.setStep(activeTool.peek() === Tool.Seeds ? Step.PlantSeed : Step.OpenMenu);
        }
        break;
      default:
        break;
    }
  }

  private setLocomotion(enabled: boolean): void {
    const slide = this.world.getSystem(SlideSystem);
    if (enabled) slide?.play();
    else slide?.stop();
    holdTurning(this.world, 'tutorial', !enabled);
    holdTeleport(this.world, 'tutorial', !enabled);
  }

  // Contextual tips --------------------------------------------------------

  private updateContextualTips(delta: number): void {
    const seeds = isToolLive(Tool.Seeds);
    const camera = isToolLive(Tool.Camera);
    const tutorialDone = this.step === Step.Ended;

    if (seedboxObject && !this.seedboxGlowAttached) {
      this.seedboxGlow.attach([
        seedboxObject.getObjectByName('Prop_SeedBox_Button') as Mesh,
        seedboxObject.getObjectByName('Prop_SeedBox_Button_Frame') as Mesh,
      ]);
      this.seedboxGlowAttached = true;
    }
    if (shutterButton && !this.shutterGlowAttached) {
      this.shutterGlow.attach([shutterButton]);
      this.shutterGlowAttached = true;
    }

    // Seedbox paging: glow the X button and pulse the label's key badges
    // (no extra bubble, the label already shows X / Y), up to 3 times.
    if (seeds && !this.wasSeeds && tutorialDone && !hasFlag('seenSeedPaging') && seedboxObject) {
      this.seedsEntries += 1;
      this.seedboxGlow.start();
      seedPagingHint.value = true;
    }
    if (!this.seedboxGlow.running) seedPagingHint.value = false;
    if (!seeds && this.wasSeeds) {
      this.seedboxGlow.stop();
      if (this.tip.shown) this.tip.hide();
      if (this.seedsEntries > 2) setFlag('seenSeedPaging');
    }
    // Paging the seedbox (X / Y, or a fingertip on the label keys) dismisses it.
    const page = seedboxPage.peek();
    const paged = this.lastSeedPage >= 0 && page !== this.lastSeedPage;
    this.lastSeedPage = page;
    if (seeds && paged) {
      if (this.seedboxGlow.running || this.tip.shown) {
        this.seedboxGlow.stop();
        this.tip.hide();
        setFlag('seenSeedPaging');
      }
    }

    // Camera shutter glow until the first shot, up to 3 visits.
    if (camera && !this.wasCamera && tutorialDone && !hasFlag('seenShutterHint')) {
      this.cameraEntries += 1;
      if (this.cameraEntries > 3) setFlag('seenShutterHint');
      else this.shutterGlow.start();
    }
    if (!camera && this.wasCamera) {
      this.shutterGlow.stop();
      if (this.photoTipShown) {
        this.tip.hide();
        this.photoTipShown = false;
      }
    }
    if (camera && this.shutterGlow.running && selectDown(this.world, 'right')) {
      this.shutterGlow.stop();
      setFlag('seenShutterHint');
    }

    this.firstUseTips(delta, tutorialDone);
    this.wasSeeds = seeds;
    this.wasCamera = camera;
    this.seedboxGlow.update(delta);
    if (this.aBeaconPending) this.attachAButtonGlow();
    this.aButtonGlow.update(delta);
    this.shutterGlow.update(delta);
  }

  private seedboxGlowAttached = false;
  private firstUse: { tool: Tool; at: number } | null = null;
  private lastTool: Tool = Tool.Explore;

  /**
   * One short tip the first time each tool is used, after the tool chip has
   * faded so bubbles never stack. Only one bubble shows at a time.
   */
  private firstUseTips(delta: number, tutorialDone: boolean): void {
    void delta;
    const tool = activeTool.peek();
    if (tool !== this.lastTool) {
      this.lastTool = tool;
      this.firstUse = FIRST_USE[tool] && !hasFlag(FIRST_USE[tool]!.flag) ? { tool, at: this.elapsed + 2.4 } : null;
      if (this.tip.shown && this.tipFromFirstUse) this.tip.hide();
    }
    if (!this.firstUse || !tutorialDone || this.elapsed < this.firstUse.at) return;
    if (this.hint.shown || this.tip.shown || !isToolLive(this.firstUse.tool)) return;
    const info = FIRST_USE[this.firstUse.tool]!;
    this.tip.show(info.content, this.world.player.gripSpaces.right, [0.08, 0.2, -0.12], 7);
    this.tipFromFirstUse = true;
    setFlag(info.flag);
    this.firstUse = null;
  }

  private tipFromFirstUse = false;
  private aButtonGlow!: ButtonBeacon;
  private aBeaconPending = false;

  /** Pulse a beacon on the real controller's A button (legacy HandNUXSystem). */
  private attachAButtonGlow(): void {
    // The controller model may still be loading; retried from update().
    this.aBeaconPending = !this.aButtonGlow.start(4);
  }
  private photoTipShown = false;
  private lastSeedPage = -1;
  private shutterGlowAttached = false;

  private onPhotoEvent(event: 'taken' | 'printed' | 'cleared'): void {
    if (event === 'printed' && this.step === Step.Ended && !hasFlag('seenPhotoHint')) {
      const camera = this.world.scene.getObjectByName('photo-camera');
      if (camera) {
        this.tip.show(
          {
            key: 'L',
            title: 'Save a photo',
            text: 'Grab the print with the left trigger and drop it on Keep or Discard.',
            hand: { key: 'Pinch', text: 'Pinch the print with your left hand and drop it on Keep or Discard.' },
          },
          camera,
          [0, 0.25, -0.15],
        );
        this.photoTipShown = true;
      }
    }
    if (event === 'cleared') {
      setFlag('seenPhotoHint');
      if (this.photoTipShown) this.tip.hide();
      this.photoTipShown = false;
    }
  }
}
