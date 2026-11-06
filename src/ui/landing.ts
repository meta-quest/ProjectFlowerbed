/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * The 2D landing overlay (legacy landing page): loading progress, enter
 * button, garden list with open / new / delete, and an about blurb. It hides
 * while an XR session is presenting. The island renders live behind it, with
 * a slow drifting camera.
 */

import { createSystem, VisibilityState, type World } from '@iwsdk/core';
import { activeGarden, gardenCommands, gardens } from '../gardening/garden-system.js';
import { islandReady } from '../world/island-state.js';
import { desktopMode } from '../desktop/emulator.js';
import { loadProgress } from './load-progress.js';
import { albumPhotos, downloadFromAlbum, getAlbumBlob, removeFromAlbum } from '../camera/photo-album.js';
import { displayCommands } from '../camera/photo-display-system.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ago = (time: number) => {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(time).toLocaleDateString();
};

export function mountLanding(world: World): void {
  const landing = $('landing');
  const enter = $<HTMLButtonElement>('enter');
  const label = $('enter-label');
  const progress = $('enter-progress');
  const list = $('gardens');
  const confirm = $('confirm');
  let pendingDelete: string | null = null;

  const render = () => {
    const current = activeGarden.peek();
    list.replaceChildren(
      ...gardens.peek().map((garden) => {
        const row = document.createElement('div');
        row.className = `garden${garden.id === current?.id ? ' active' : ''}`;
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        // The garden's latest kept photo doubles as its thumbnail.
        const thumb = albumPhotos.peek().find((photo) => photo.gardenId === garden.id)?.thumb;
        row.innerHTML = thumb
          ? `<img class="thumb" alt="" /><span class="meta"><span class="name"></span><span class="sub"></span></span>`
          : `<span class="dot"></span><span class="meta"><span class="name"></span><span class="sub"></span></span>`;
        if (thumb) (row.querySelector('.thumb') as HTMLImageElement).src = thumb;
        (row.querySelector('.name') as HTMLElement).textContent = garden.name;
        (row.querySelector('.sub') as HTMLElement).textContent =
          `${garden.plants} plant${garden.plants === 1 ? '' : 's'} - updated ${ago(garden.updated)}`;
        if (gardens.peek().length > 1) {
          const remove = document.createElement('button');
          remove.className = 'delete';
          remove.title = 'Delete garden';
          remove.textContent = '×';
          remove.addEventListener('click', (event) => {
            event.stopPropagation();
            pendingDelete = garden.id;
            $('confirm-title').textContent = `Delete ${garden.name}?`;
            confirm.classList.add('open');
          });
          row.append(remove);
        }
        row.addEventListener('click', () => gardenCommands.open(garden.id));
        return row;
      }),
    );
    if (current && islandReady.peek()) {
      label.textContent = current.plants > 0 ? `Return to ${current.name}` : `Start gardening`;
    }
  };

  // Gallery: the latest kept photos from every garden.
  const GALLERY = 8;
  let openPhoto: string | null = null;
  let photoUrl = '';
  const renderGallery = () => {
    const photos = albumPhotos.peek();
    $('gallery-block').hidden = photos.length === 0;
    $('gallery-count').textContent = photos.length ? `· ${photos.length}` : '';
    $('gallery').replaceChildren(
      ...photos.slice(0, GALLERY).map((photo, i) => {
        const button = document.createElement('button');
        const garden = gardens.peek().find((entry) => entry.id === photo.gardenId)?.name ?? 'Garden';
        button.title = `${garden} - ${new Date(photo.created).toLocaleDateString()}`;
        const img = document.createElement('img');
        img.src = photo.thumb;
        img.alt = button.title;
        button.append(img);
        const extra = photos.length - GALLERY;
        if (i === GALLERY - 1 && extra > 0) {
          const more = document.createElement('span');
          more.className = 'more';
          more.textContent = `+${extra + 1}`;
          button.append(more);
        }
        button.addEventListener('click', () => showPhoto(photo.id));
        return button;
      }),
    );
  };

  /** Open one album photo in the lightbox, with caption and actions. */
  const showPhoto = (id: string) => {
    const photos = albumPhotos.peek();
    const index = photos.findIndex((p) => p.id === id);
    if (index < 0) return closeLightbox();
    const photo = photos[index];
    openPhoto = id;
    if (lightbox.hidden || lightImage.hidden) openLightbox(photo.thumb, false);
    else lightImage.src = photo.thumb;
    const garden = gardens.peek().find((g) => g.id === photo.gardenId)?.name ?? 'A garden';
    const when = new Date(photo.created).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    $('photo-caption').innerHTML = '';
    $('photo-caption').append(
      garden,
      Object.assign(document.createElement('small'), { textContent: `${when} - ${index + 1} of ${photos.length}` }),
    );
    $<HTMLButtonElement>('photo-prev').disabled = photos.length < 2;
    $<HTMLButtonElement>('photo-next').disabled = photos.length < 2;
    $('photo-bar').hidden = false;
    // Swap in the full-size print once it is read from the album.
    void getAlbumBlob(id).then((blob) => {
      if (!blob || openPhoto !== id) return;
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(blob);
      lightImage.src = photoUrl;
    });
  };
  const stepPhoto = (by: number) => {
    $('photo-delete').textContent = 'Delete';
    const photos = albumPhotos.peek();
    const index = photos.findIndex((p) => p.id === openPhoto);
    if (index >= 0 && photos.length > 1) showPhoto(photos[(index + by + photos.length) % photos.length].id);
  };

  gardens.subscribe(render);
  albumPhotos.subscribe(render);
  albumPhotos.subscribe(renderGallery);
  // A photo deleted elsewhere closes (or moves on in) the lightbox.
  albumPhotos.subscribe((photos) => {
    if (openPhoto && !photos.some((p) => p.id === openPhoto)) closeLightbox();
  });
  activeGarden.subscribe(render);

  // Loading progress from real asset requests (see load-progress.ts).
  const stopProgress = loadProgress.subscribe((value) => {
    progress.style.width = `${Math.max(8, Math.round(value * 95))}%`;
  });
  islandReady.subscribe((ready) => {
    if (!ready) return;
    stopProgress();
    progress.style.width = '100%';
    window.setTimeout(() => (progress.style.opacity = '0'), 600);
    enter.disabled = !world.xrEnabled;
    render();
  });

  const vrSupported = navigator.xr?.isSessionSupported('immersive-vr').catch(() => false);
  void vrSupported?.then((supported) => {
    // Legacy "Send to headset": open this page in the Quest browser. On a
    // desktop the emulator already answers "VR supported", so ask it instead.
    const send = $<HTMLAnchorElement>('send-to-headset');
    send.hidden = !desktopMode();
    send.href = `https://www.oculus.com/open_url/?url=${encodeURIComponent(location.href)}`;
    $('device-hint').textContent = desktopMode()
      ? 'No headset found: you can still visit with mouse and keyboard.'
      : supported
        ? 'Put on your headset to step into your garden. It saves as you go.'
        : 'Open this page in the Meta Quest browser to garden in VR.';
  });

  enter.addEventListener('click', () => world.launchXR());
  $('new-garden').addEventListener('click', () => gardenCommands.create());
  const about = $('about');
  const lightbox = $('lightbox');
  const lightImage = $<HTMLImageElement>('lightbox-image');
  const lightVideo = $<HTMLVideoElement>('lightbox-video');
  const openLightbox = (src: string, video: boolean) => {
    lightImage.hidden = video;
    lightVideo.hidden = !video;
    if (video) {
      lightVideo.src = src;
      void lightVideo.play().catch(() => {});
    } else {
      lightImage.src = src;
    }
    lightbox.hidden = false;
  };
  const closeLightbox = () => {
    lightbox.hidden = true;
    lightVideo.pause();
    openPhoto = null;
    $('photo-bar').hidden = true;
  };
  $('photo-prev').addEventListener('click', () => stepPhoto(-1));
  $('photo-next').addEventListener('click', () => stepPhoto(1));
  $('photo-download').addEventListener('click', () => {
    if (openPhoto) void downloadFromAlbum(openPhoto);
  });
  let armed: string | null = null;
  let armTimer = 0;
  const disarm = () => {
    armed = null;
    $('photo-delete').textContent = 'Delete';
  };
  $('photo-delete').addEventListener('click', () => {
    const id = openPhoto;
    if (!id) return;
    // Two clicks: the first asks for confirmation.
    if (armed !== id) {
      armed = id;
      $('photo-delete').textContent = 'Click again to delete';
      window.clearTimeout(armTimer);
      armTimer = window.setTimeout(disarm, 3000);
      return;
    }
    disarm();
    const photos = albumPhotos.peek();
    const index = photos.findIndex((p) => p.id === id);
    const next = photos[index + 1] ?? photos[index - 1];
    displayCommands.remove(id);
    void removeFromAlbum(id).then(() => (next ? showPhoto(next.id) : closeLightbox()));
  });
  $('about-toggle').addEventListener('click', () => (about.hidden = false));
  $('about-close').addEventListener('click', () => (about.hidden = true));
  about.addEventListener('click', (event) => {
    if (event.target === about) about.hidden = true;
  });
  about
    .querySelectorAll<HTMLImageElement>('img[data-full]')
    .forEach((img) => img.addEventListener('click', () => openLightbox(img.dataset.full!, false)));
  $('watch-trailer').addEventListener('click', () =>
    openLightbox(`${import.meta.env.BASE_URL}flowerbed/videos/sizzle_trailer.mp4`, true),
  );
  $('lightbox-close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  window.addEventListener('keydown', (event) => {
    if (!lightbox.hidden && openPhoto && event.key === 'ArrowLeft') stepPhoto(-1);
    if (!lightbox.hidden && openPhoto && event.key === 'ArrowRight') stepPhoto(1);
    if (event.key !== 'Escape') return;
    if (!lightbox.hidden) closeLightbox();
    else about.hidden = true;
  });
  $('confirm-yes').addEventListener('click', () => {
    if (pendingDelete) gardenCommands.remove(pendingDelete);
    pendingDelete = null;
    confirm.classList.remove('open');
  });
  $('confirm-no').addEventListener('click', () => {
    pendingDelete = null;
    confirm.classList.remove('open');
  });

  world.visibilityState.subscribe((state) => {
    landing.classList.toggle('hidden', state !== VisibilityState.NonImmersive);
  });
}

/** Slow, gentle look-around for the browser view behind the landing card. */
export class AttractCameraSystem extends createSystem({}) {
  private t = 0;

  override update(delta: number): void {
    if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) return;
    this.t += delta;
    // A raised vista over the pond and gazebo, drifting slowly.
    const camera = this.world.camera;
    camera.position.set(0.6 + Math.sin(this.t * 0.04) * 0.4, 2.7, 1.8);
    camera.rotation.set(-0.16 + Math.sin(this.t * 0.07) * 0.02, 0.22 + Math.sin(this.t * 0.05) * 0.14, 0, 'YXZ');
  }
}
