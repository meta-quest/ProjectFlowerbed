/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 *
 * @param {THREE.WEBGLREnderer} renderer
 * @param {HTMLButtonElement} button
 * @param {*} callbacks
 */
export const convertToVRButton = (renderer, button, callbacks = {}) => {
	function showEnterVR() {
		let currentSession = null;

		function onSessionStarted(session) {
			session.addEventListener('end', onSessionEnded);

			renderer.xr.setSession(session).then(() => {
				currentSession = session;
			});

			if (callbacks.onSessionStarted) {
				callbacks.onSessionStarted();
			}
		}

		function onSessionEnded() {
			currentSession.removeEventListener('end', onSessionEnded);
			currentSession = null;

			if (callbacks.onSessionEnded) {
				callbacks.onSessionEnded();
			}
		}

		button.onclick = () => {
			if (currentSession === null) {
				let optionalFeatures = [
					'local-floor',
					'bounded-floor',
					'high-fixed-foveation-level',
				];

				const sessionInit = {
					optionalFeatures: optionalFeatures,
				};
				window.goFullScreen();
				navigator.xr
					.requestSession('immersive-vr', sessionInit)
					.then(onSessionStarted);

				if (callbacks.onClick) {
					callbacks.onClick();
				}
			} else {
				currentSession.end();
			}
		};

		button.classList.add('vr-button');
	}

	function showSendToVR() {
		button.textContent = 'Send to headset';
		button.onclick = () => {
			// instead of entering the garden, we show a link to the 'send to VR' URL.
			window.open(
				'https://www.oculus.com/open_url/?url=https%3A%2F%2Fflowerbed.metademolab.com',
			);
		};
	}

	if ('xr' in navigator) {
		navigator.xr.isSessionSupported('immersive-vr').then(function (supported) {
			supported ? showEnterVR() : showSendToVR();
		});
	} else {
		showSendToVR();
	}
};
