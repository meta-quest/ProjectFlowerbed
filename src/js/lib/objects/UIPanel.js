/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import * as ThreeMeshUI from 'three-mesh-ui';

import { AssetURLs } from '@config/AssetURLs';
import { UI_CONSTANTS } from '../../Constants';
import { updateMatrixRecursively } from '../../utils/object3dUtils';

/**
 * By default, UIPanels use pixels as the unit for UI, so this converts them to meters
 * to use with Three Mesh UI's system.
 * @param {*} options - options for a ThreeMeshUI.Block
 * @returns the same options object, which is mutated by the function
 */
const convertOptionsFromPixelsToMeters = (options) => {
	if (options.convertedToMeters) {
		return;
	}

	const optionsToConvert = [
		'width',
		'height',
		'interLine',
		'padding',
		'margin',
		'offset',
		'fontSize',
		'borderRadius',
	];

	for (let option of optionsToConvert) {
		// width and height can be 'auto', so we need to check that they're numbers
		// before converting
		if (options[option] && !isNaN(options[option])) {
			options[option] = options[option] / UI_CONSTANTS.UI_PIXELS_PER_METER;
		}
	}

	options.convertedToMeters = true;
	return options;
};

/**
 * As of https://github.com/felixmariotto/three-mesh-ui/issues/27, three-mesh-ui doesn't
 * natively support auto width / height, where a child expands to the full size of the parent.
 * This adds a fairly naive version of it.
 * @param {*} options - options for a ThreeMeshUI.Block
 * @param {ThreeMeshUI.Block} parentBlock
 */
const convertAutoWidthHeight = (options, parentBlock) => {
	if (options.width === 'auto') {
		options.width = parentBlock.width - parentBlock.padding * 2;
	}
	if (options.height === 'auto') {
		options.height = parentBlock.height - parentBlock.padding * 2;
	}
};

export class UIPanel extends THREE.Group {
	/**
	 * A UI panel is a wrapper on top of three-mesh-ui that can also hold a mesh that is used as a background
	 * (used in the NUX and settings menu), as well as manage videos and other media that are displayed on the UI.
	 * @param {number} width width of the underlying ThreeMeshUI.Block in pixels
	 * @param {number} height height of the underlying ThreeMeshUI.Block in pixels
	 * @param {*} panelOptions ThreeMeshUI.Block options to send to the underlying block.
	 */
	constructor(width = 512, height = 544, panelOptions = {}) {
		super();

		// holds all the videos that this panel controls, so that the videos
		// can be played when the panel is shown.
		// These video elements are created in UIPanelMediaSystem.
		this._videoElements = [];

		this.panel = new UIPanelBlock(width, height, panelOptions);
		this.add(this.panel);
		this.background = undefined;
		this.mainObject = this.panel;

		this._tweenValues = { scale: 0 };
		this.showTween = new TWEEN.Tween(this._tweenValues)
			.to({ scale: 1 }, UI_CONSTANTS.UI_FADE_TIME) // second value is time n ms
			.easing(TWEEN.Easing.Quadratic.Out)
			.onUpdate(() => {
				this.scale.set(
					this._tweenValues.scale,
					this._tweenValues.scale,
					this._tweenValues.scale,
				);
			});

		this.hideTween = new TWEEN.Tween(this._tweenValues)
			.to({ scale: 0 }, UI_CONSTANTS.UI_FADE_TIME)
			.easing(TWEEN.Easing.Quadratic.Out)
			.onUpdate(() => {
				this.scale.set(
					this._tweenValues.scale,
					this._tweenValues.scale,
					this._tweenValues.scale,
				);
			})
			.onComplete(() => {
				this.parent.remove(this);
				this.matrixAutoUpdate = false;
			});

		this.addSubBlock = this.panel.addSubBlock.bind(this.panel);
		this.addVerticalLayoutSubBlock = this.panel.addVerticalLayoutSubBlock.bind(
			this.panel,
		);
		this.addHorizontalLayoutSubBlock = this.panel.addHorizontalLayoutSubBlock.bind(
			this.panel,
		);
		this.addText = this.panel.addText.bind(this.panel);
		this.addInlineImage = this.panel.addInlineImage.bind(this.panel);
		this.addImage = this.panel.addImage.bind(this.panel);
		this.addButton = this.panel.addButton.bind(this.panel);
	}

	/**
	 *
	 * @param {THREE.Object3D} mesh the object to use as the panel's 'background'
	 * @param {THREE.Vector3} offsets offsets in *pixels* for the text from the background. We assume
	 * 	that the background's position is the position of the whole panel.
	 */
	setBackgroundMesh(mesh, offsets = undefined) {
		if (this.background && this.getObjectById(this.background.id)) {
			this.remove(this.background);
		}

		if (mesh) {
			if (offsets) {
				this.panel.position
					.copy(offsets)
					.multiplyScalar(1 / UI_CONSTANTS.UI_PIXELS_PER_METER);
			}
			this.add(mesh);
		}

		this.background = mesh;

		// make sure that the background doesn't cast or receive shadows.
		mesh.traverse((node) => {
			if (!node.isMesh) {
				return;
			}
			node.castShadow = false;
			node.receiveShadow = false;
		});
		this.mainObject = this.background ?? this.panel;
	}

	/**
	 * Adds this UIPanel to the given scene
	 * @param {THREE.Scene} parent The scene to add the panel to.
	 * @param {boolean} shouldAnimateIn If set to true, will use a tween to pop in with a short animation.
	 */
	addToSceneTree(parent, shouldAnimateIn = true) {
		if (this.parent) {
			if (this.hideTween.isPlaying()) {
				this.hideTween.stop();
			} else {
				console.warn('UI panel was already added to the scene tree.');
			}
		}
		this.parent = parent;
		parent.add(this);

		this.matrixAutoUpdate = true;

		// play videos that have been added
		for (let video of this._videoElements) {
			video.play();
		}

		// animations
		if (shouldAnimateIn) {
			this._tweenValues.scale = 0;
			this.scale.set(0, 0, 0);
			this.showTween.start();
		} else {
			this.scale.set(1, 1, 1);
		}

		updateMatrixRecursively(this);
	}

	removeFromSceneTree(shouldAnimateOut = true) {
		if (!this.parent) {
			return;
		}

		// pause videos that have been added.
		for (let video of this._videoElements) {
			video.pause();
		}

		if (shouldAnimateOut) {
			this.hideTween.start();
		} else {
			this.parent.remove(this);
			this.matrixAutoUpdate = false;
		}
	}

	/**
	 * Adds a new video to the panel, which will be played as the panel is added to the scene, then stopped
	 * when the panel is removed from the scene.
	 * @param {HTMLVideoElement} videoElement
	 */
	addVideoElement(videoElement) {
		this._videoElements.push(videoElement);
	}

	getInteractableElements() {
		if (this.background) {
			return [this.background, ...this.panel.getInteractableElements()];
		}

		return this.panel.getInteractableElements();
	}

	getToggles() {
		return this.panel.toggles;
	}
}

class UIPanelBlock extends ThreeMeshUI.Block {
	/**
	 * A thin wrapper around ThreeMeshUI.Block that adds a few helper functions to
	 * create subpanels, and sets all values to be in pixels to make conversions from
	 * designs easier.
	 *
	 * Generally, you only manually create a UIPanel object to create a new, top-level panel.
	 * If you want to nest sub-blocks or create a layout, use the `add` helper functions to do that.
	 *
	 * @param {number} width - width of the new UI panel in pixels
	 * @param {number} height - height of the new UI panel in pixels
	 * @param {*} options - optional additional options for the underlying ThreeMeshUI.Block
	 */
	constructor(width = 512, height = 544, options = {}) {
		convertOptionsFromPixelsToMeters(options);
		const panelOptions = {
			width: width / UI_CONSTANTS.UI_PIXELS_PER_METER,
			height: height / UI_CONSTANTS.UI_PIXELS_PER_METER,
			backgroundColor: new THREE.Color(0xffffff),
			padding: 0,
			borderRadius: 16 / UI_CONSTANTS.UI_PIXELS_PER_METER,
			fontColor: new THREE.Color(0x000000),
			backgroundOpacity: 0,
			...options,
		};
		super(panelOptions);

		this.pixelWidth = width;
		this.pixelHeight = height;

		this._interactables = [];

		// base panel is the highest level panel that was created by the constructor.
		this._basePanel = null;

		// a map of all the toggle switches, because we might need to set them outside of
		// their interactions
		this.toggles = {};

		// one time check: if the panel is configured to not have a background opacity
		// we opt against drawing the background at all.
		const shouldShowBackground = panelOptions.backgroundOpacity !== 0;
		if (!shouldShowBackground) {
			let frame = this.getObjectByName('Frame');
			if (frame) {
				frame.visible = false;
			}
		}
	}

	/**
	 * Creates a sub-UIPanel and adds it to this one.
	 * @param {*} options
	 * @returns {UIPanelBlock}
	 */
	addSubBlock(options = {}) {
		const parentBlock = this;
		convertOptionsFromPixelsToMeters(options);
		convertAutoWidthHeight(options, parentBlock);
		const newBlock = new UIPanelBlock(512, 544, options);
		newBlock._basePanel = this._basePanel ?? this;
		parentBlock.add(newBlock);
		return newBlock;
	}

	// LAYOUT FUNCTIONS
	// Used when defining the UI Panels

	/**
	 * Creates a sub-UIPanel for a vertically stacked layout, attached to the current panel.
	 * @param {number} height - If between 0 and 1, calculated as a % of height of the parent. Otherwise, the pixel height of the panel.
	 * @param {*} options - ThreeMeshUI.Block options to send to the new subpanel
	 * @returns {UIPanelBlock} the newly created UIPanel, which is already added to the scene tree.
	 */
	addVerticalLayoutSubBlock(height = 1, options = {}) {
		const parentBlock = this;
		const trueHeight =
			height > 1
				? height / UI_CONSTANTS.UI_PIXELS_PER_METER
				: (parentBlock.height - parentBlock.padding * 2) * height;
		convertOptionsFromPixelsToMeters(options);
		const newBlockOptions = {
			offset: 0,
			width: parentBlock.width - parentBlock.padding * 2,
			height: trueHeight,
			backgroundOpacity: 0,
			...options,
		};

		return this.addSubBlock(newBlockOptions);
	}

	/**
	 * Creates a sub-UIPanel for a horizontally arranged layout, attached to the current panel.
	 * @param {number} width - If between 0 and 1, calculated as a % of width of the parent. Otherwise, the pixel width of the panel.
	 * @param {*} options - ThreeMeshUI.Block options to send to the new subpanel
	 * @returns {UIPanelBlock} the newly created UIPanel, which is already added to the scene tree.
	 */
	addHorizontalLayoutSubBlock(width = 1, options = {}) {
		const parentBlock = this;
		const trueWidth =
			width > 1
				? width / UI_CONSTANTS.UI_PIXELS_PER_METER
				: (parentBlock.width - parentBlock.padding * 2) * width;
		convertOptionsFromPixelsToMeters(options);
		const newBlockOptions = {
			offset: 0,
			width: trueWidth,
			height: parentBlock.height - parentBlock.padding * 2,
			backgroundOpacity: 0,
			...options,
		};

		return this.addSubBlock(newBlockOptions);
	}

	/**
	 * Adds a text block to this panel. Only one text block should be added to a single panel;
	 * create additional subpanels to add more.
	 * @param {string} text - the string to render
	 * @param {*} options - ThreeMeshUI.Text options to send to the new subpanel.
	 * @returns {Text} the new text object
	 */
	addText(text, options = {}) {
		const parentBlock = this;
		convertOptionsFromPixelsToMeters(options);

		const defaultFontSize = parentBlock.isButton ? 18 : 14;

		const baseFont = {
			fontFamily: 'assets/fonts/Roboto-Regular-48.json',
			fontTexture: 'assets/fonts/Roboto-Regular-48.png',
			fontSize: defaultFontSize / UI_CONSTANTS.UI_PIXELS_PER_METER,
			fontColor: new THREE.Color(parentBlock.isButton ? 0xffffff : 0x000000),
			fontSupersampling: true,
			...options,
		};

		if (options.bold === true) {
			baseFont.fontFamily = 'assets/fonts/Roboto-Bold-48.json';
			baseFont.fontTexture = 'assets/fonts/Roboto-Bold-48.png';
		}

		const textObj = new ThreeMeshUI.Text({
			content: text,
			...baseFont,
		});

		parentBlock.add(textObj);
		return textObj;
	}

	/**
	 * Adds an empty button to this panel.
	 * @param {() => void} onclick - callback that is fired when the button is pressed.
	 * @param {*} options - ThreeMeshUI.Block options to pass to the button to change styling
	 * @returns {UIButton} the UIButton object that is already added to the scene tree
	 */
	addButton(onclick, options = {}) {
		if (!options.width) {
			options.width = 'auto';
		}
		options = {
			...{
				height: 50,
			},
			...options,
		};

		const parentBlock = this;
		convertOptionsFromPixelsToMeters(options);
		convertAutoWidthHeight(options, parentBlock);

		const button = new UIButton(onclick, options);
		button._basePanel = this._basePanel ?? this;

		parentBlock.add(button);

		if (this._basePanel) {
			this._basePanel._interactables.push(button);
		}
		this._interactables.push(button);

		return button;
	}

	addToggleSwitch(id, onclick, options = {}) {
		const parentBlock = this;
		convertOptionsFromPixelsToMeters(options);
		convertAutoWidthHeight(options, parentBlock);

		const toggleSwitch = new UIToggleSwitch(onclick, false, options);
		toggleSwitch._basePanel = this._basePanel ?? this;

		parentBlock.add(toggleSwitch);

		if (this._basePanel) {
			this._basePanel._interactables.push(toggleSwitch);
			this._basePanel.toggles[id] = toggleSwitch;
		}
		this._interactables.push(toggleSwitch);
		this.toggles[id] = toggleSwitch;

		return toggleSwitch;
	}

	addInlineImage(imageURL, blockOptions = {}) {
		convertOptionsFromPixelsToMeters(blockOptions);
		const newBlock = new ThreeMeshUI.InlineBlock({
			backgroundSize: 'stretch',
			borderRadius: 0,
			backgroundOpacity: 1,
			offset: UI_CONSTANTS.UI_OFFSET_BUFFER,
			width: 'auto',
			height: 'auto',
			...blockOptions,
		});
		this.add(newBlock);
		const loader = new THREE.TextureLoader();
		loader.load(imageURL, (texture) => {
			newBlock.set({
				backgroundTexture: texture,
			});

			newBlock.isImage = true;
		});

		return newBlock;
	}

	addImage(imageURL, blockOptions = {}) {
		const newBlock = this.addSubBlock({
			backgroundSize: 'stretch',
			borderRadius: 0,
			backgroundOpacity: 1,
			offset: UI_CONSTANTS.UI_OFFSET_BUFFER,
			width: 'auto',
			height: 'auto',
			...blockOptions,
		});
		const loader = new THREE.TextureLoader();
		loader.load(imageURL, (texture) => {
			newBlock.set({
				backgroundTexture: texture,
			});

			newBlock.isImage = true;
		});

		return newBlock;
	}

	getInteractableElements() {
		return this._interactables;
	}
}

class UIButton extends UIPanelBlock {
	/**
	 * Creates a button, using the same template ThreeMeshUI.Block,
	 * that interacts with rays and can be clicked on.
	 * See UIPanelInteractionSystem for how buttons work.
	 * @param {() => void} onclick
	 * @param {*} options
	 */
	constructor(onclick, options = {}) {
		convertOptionsFromPixelsToMeters(options);
		const buttonOptions = {
			justifyContent: 'center',
			alignItems: 'center',
			offset: UI_CONSTANTS.UI_OFFSET_BUFFER,
			borderRadius: 30 / UI_CONSTANTS.UI_PIXELS_PER_METER,
			backgroundColor: options.backgroundColor ?? new THREE.Color(0x1364e7),
			backgroundOpacity: 1,
			fontColor: new THREE.Color(0xffffff),
			...options,
		};

		const idleStateAttributes = {
			state: 'idle',
			attributes: {
				backgroundColor: options.backgroundColor ?? new THREE.Color(0x1364e7),
				backgroundOpacity: 1,
			},
		};

		const hoveredStateAttributes = {
			state: 'hovered',
			attributes: {
				backgroundColor: options.hoverColor ?? new THREE.Color(0x2280ff),
				backgroundOpacity: 1,
			},
		};

		const selectedStateAttributes = {
			state: 'selected',
			attributes: {
				backgroundColor: options.selectedColor ?? new THREE.Color(0x1364e7),
				backgroundOpacity: 1,
			},
		};

		super(buttonOptions.width, buttonOptions.height, buttonOptions);

		this.setupState(idleStateAttributes);
		this.setupState(hoveredStateAttributes);
		this.setupState(selectedStateAttributes);

		this.setState('idle');

		this.isButton = true;
		this.clickHandler = onclick;
	}

	click() {
		this.clickHandler();
	}
}

// create those textures outside of the class so that they're reused. These textures are loaded
// upon entering VR.
let _switch_offTexture;
let _switch_onTexture;
let _switch_hoverTexture;

window.addEventListener('experiencestart', async () => {
	let loader = new THREE.TextureLoader();
	_switch_offTexture = await loader.loadAsync(AssetURLs.UI.SWITCH_OFF);
	_switch_onTexture = await loader.loadAsync(AssetURLs.UI.SWITCH_ON);
	_switch_hoverTexture = await loader.loadAsync(AssetURLs.UI.SWITCH_HOVER);
});

class UIToggleSwitch extends UIButton {
	constructor(onclick, isToggled = false, options = {}) {
		super(onclick, {
			width: 40 / UI_CONSTANTS.UI_PIXELS_PER_METER,
			height: 24 / UI_CONSTANTS.UI_PIXELS_PER_METER,
			backgroundColor: new THREE.Color(0xffffff),
			borderRadius: 0,
			...options,
		});
		this.isToggled = isToggled;
		const idleStateAttributes = {
			state: 'idle',
			onSet: () => this._updateTexture(),
		};

		const hoveredStateAttributes = {
			state: 'hovered',
			onSet: () => this._updateTexture(),
		};

		const selectedStateAttributes = {
			state: 'selected',
		};

		this.setupState(idleStateAttributes);
		this.setupState(hoveredStateAttributes);
		this.setupState(selectedStateAttributes);

		this.setState('idle');
		this._updateTexture();
	}

	click() {
		this.isToggled = !this.isToggled;
		this.clickHandler();
		this._updateTexture();
	}

	setIsToggled(newValue) {
		this.isToggled = newValue;
		this._updateTexture();
	}

	async _updateTexture() {
		if (this.isToggled) {
			this.set({
				backgroundTexture: _switch_onTexture,
			});
			return;
		}

		if (this.currentState === 'hovered') {
			this.set({
				backgroundTexture: _switch_hoverTexture,
			});
			return;
		}

		this.set({
			backgroundTexture: _switch_offTexture,
		});
	}
}
