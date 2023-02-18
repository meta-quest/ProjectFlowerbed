/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

class VRPerformanceUI {
	constructor() {
		this.perfOptions = {
			enableShadows: {
				type: 'boolean',
				text: 'ENABLE SHADOWS',
				value: false,
				needsUpdate: true,
			},
			shadowMapSize: {
				type: 'number',
				text: 'SHADOW MAP SIZE',
				value: 512,
				needsUpdate: true,
			},
			renderingDistance: {
				type: 'number',
				text: 'RENDERING DISTANCE',
				value: 100,
				needsUpdate: true,
			},
			frameBufferScaleFactor: {
				type: 'number',
				text: 'FRAME BUFFER SCALE',
				value: 1.0,
				needsUpdate: true,
			},
			frameRateControl: {
				type: 'boolean',
				text: 'FRAME RATE CONTROL',
				value: true,
				needsUpdate: true,
			},
			targetFrameRate: {
				type: 'number',
				text: 'TARGET FRAME RATE',
				value: 72,
				needsUpdate: true,
			},
		};
		this.pendingChange = true;

		this.generateUIElements();
	}

	getPerfOptions() {
		return this.perfOptions;
	}

	resetChangeState() {
		for (let id in this.perfOptions) {
			this.perfOptions[id].needsUpdate = false;
		}
		this.pendingChange = false;
	}

	generateUIElements() {
		const anchor = document.getElementById('perf-settings');
		if (!anchor) {
			return; // nowhere to attach UI elements.
		}
		const optionsDiv = document.createElement('div');

		optionsDiv.style.top = '25px';
		optionsDiv.style.left = '25px';
		optionsDiv.style.padding = '12px 6px';
		optionsDiv.style.borderRadius = '4px';
		optionsDiv.style.color = '#000000';
		optionsDiv.style.font = 'normal 15px sans-serif';

		optionsDiv.onchange = function () {
			for (let id in this.perfOptions) {
				let option = this.perfOptions[id];
				let optionValue;
				if (option.type == 'boolean') {
					optionValue = document.getElementById(id).checked;
				} else {
					optionValue = document.getElementById(id).value;
				}
				if (optionValue != option.value) {
					this.pendingChange = true;
					this.perfOptions[id].needsUpdate = true;
					this.perfOptions[id].value = optionValue;
				}
			}
		}.bind(this);

		for (let id in this.perfOptions) {
			let option = this.perfOptions[id];
			let optionDiv = document.createElement('div');
			optionDiv.style.padding = '5px';
			optionsDiv.appendChild(optionDiv);

			let label = document.createElement('label');
			label.setAttribute('for', id);
			label.textContent = option.text;
			optionDiv.appendChild(label);

			let inputField;
			if (option.type == 'boolean') {
				inputField = document.createElement('input');
				inputField.setAttribute('type', 'checkbox');
				inputField.checked = option.value;
				inputField.style.width = '18px';
				inputField.style.height = '18px';
			} else if (option.type == 'number') {
				inputField = document.createElement('input');
				inputField.setAttribute('type', 'number');
				inputField.value = option.value;
				inputField.style.width = '75px';
			}
			inputField.setAttribute('id', id);
			inputField.style.position = 'absolute';
			inputField.style.right = '25px';
			optionDiv.appendChild(inputField);
		}

		anchor.appendChild(optionsDiv);
	}

	perfValue(option) {
		if (this.perfOptions[option]) {
			return this.perfOptions[option].value;
		}
	}
}

export { VRPerformanceUI };
