/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import { Component, SystemStateComponent, Types } from 'ecsy';
import { UIPanel } from '../lib/objects/UIPanel';

export class UIPanelComponent extends Component {
	/**
	 * Creates a UIPanelComponent from a JSON UIPanel definition.
	 * @param {Object} jsonUIPanel - JS object representation of a JSON UIPanel
	 * @param {Record<string, function>} buttonMap - functions that should be called when the buttons are pressed.
	 * A function with the key that matches the button's name will be added to the click handler of that button
	 * @returns the parameters to create a UIPanelComponent.
	 */
	static createFromJSON(jsonUIPanel, buttonMap = {}) {
		let expectedWidth = jsonUIPanel.width ?? 512;
		let expectedHeight = jsonUIPanel.height ?? 512;

		let uiPanel = new UIPanel(
			expectedWidth,
			expectedHeight,
			jsonUIPanel.uiPanelParams ?? {},
		);

		const uiPanelComponentParams = {
			uiPanel,
			backgroundMeshId: jsonUIPanel.backgroundMeshId,
			shouldLookAtCamera: jsonUIPanel.shouldLookAtCamera,
			interactable: jsonUIPanel.interactable,
			backgroundTextureURL: jsonUIPanel.backgroundTextureURL,
			backgroundOffset: new THREE.Vector3(),
		};

		uiPanelComponentParams.backgroundOffset.fromArray(
			jsonUIPanel.backgroundOffset ?? [0, 0, 0],
		);

		UIPanelComponent._createSubBlocksFromJSON(uiPanel, jsonUIPanel, buttonMap);
		return uiPanelComponentParams;
	}

	/**
	 * Helper function to create all children UIPanels from a JSON object
	 * @param {UIPanel} parentBlock
	 * @param {Object} parentJSON
	 * @param {Record<string, function>} buttonMap
	 * @returns
	 */
	static _createSubBlocksFromJSON(parentBlock, parentJSON, buttonMap) {
		let children = parentJSON.children;
		if (!children || !children.length) {
			return;
		}
		for (let child of children) {
			const params = { ...child };
			for (let param in params) {
				if (
					typeof params[param] === 'string' &&
					params[param].startsWith('0x')
				) {
					// it's a color, and should be created as such
					params[param] = new THREE.Color(parseInt(params[param], 16));
				}
			}
			delete params.children;
			switch (child.type) {
				case 'vertical': {
					const verticalBlock = parentBlock.addVerticalLayoutSubBlock(
						child.size ?? 1,
						params,
					);
					UIPanelComponent._createSubBlocksFromJSON(
						verticalBlock,
						child,
						buttonMap,
					);
					break;
				}
				case 'horizontal': {
					const horizontalBlock = parentBlock.addHorizontalLayoutSubBlock(
						child.size ?? 1,
						params,
					);
					UIPanelComponent._createSubBlocksFromJSON(
						horizontalBlock,
						child,
						buttonMap,
					);
					break;
				}
				case 'text':
					parentBlock.addText(child.text, params);
					// text shouldn't really have children?
					break;
				case 'image':
					parentBlock.addInlineImage(child.url, params);
					// images shouldn't have children either
					break;
				case 'imageBlock':
					parentBlock.addImage(child.url, params);
					break;
				case 'button': {
					let buttonFunction = () => {};
					if (buttonMap[child.name]) {
						buttonFunction = buttonMap[child.name];
					}
					const buttonBlock = parentBlock.addButton(buttonFunction, params);
					UIPanelComponent._createSubBlocksFromJSON(
						buttonBlock,
						child,
						buttonMap,
					);
					break;
				}
				case 'toggle': {
					let buttonFunction = () => {};
					if (buttonMap[child.name]) {
						buttonFunction = buttonMap[child.name];
					}
					parentBlock.addToggleSwitch(child.name, buttonFunction, params);
					// toggles can't have text on them.
					break;
				}
			}
		}
	}
}

// required to be combined with an Object3D component that just contains
// an empty THREE.Group for positioning the UI panel
UIPanelComponent.schema = {
	/**
	 * @type {UIPanel} a reference to a UIPanel object, defined elsewhere
	 */
	uiPanel: { type: Types.Ref, default: undefined },

	// Panels can be set to be un-interactable if there are no buttons on it. There are no visual changes at this time.
	interactable: { type: Types.Boolean, default: true },

	/**
	 * @type {THREE.Object3D | undefined} the parent to add the uiPanel to. If undefined, it'll be added directly to the main scene.
	 */
	parent: { type: Types.Ref, default: undefined },

	// boolean - set to true if the UI panel should rotate. Do not set if the UI is already using gaze-follow.
	shouldLookAtCamera: { type: Types.Boolean, default: false },

	// if set, adds the 3D model backdrop to the UI Panel and hides the panel backgrounds.
	// this must be enabled to use the UIPanelMedia component.
	backgroundMeshId: { type: Types.String, default: '' },

	backgroundTextureURL: { type: Types.String, default: '' },

	/**
	 * @type {THREE.Vector3} a vector that determines the positional offset of the UIPanel from the mesh background;
	 * unused if the panel does not have a background, and if undefined will use a default value.
	 * x, y, and z of backgroundOffset should be in **pixels**, like how the rest of the UI uses pixels.
	 */
	backgroundOffset: { type: Types.Ref, default: undefined },
};

/**
 * Component used to show an image or video in the masked space of the UI panel's background
 */
export class UIPanelMedia extends Component {
	static createFromJSON(jsonUIPanel) {
		if (!jsonUIPanel.mediaURL) {
			return undefined;
		}
		return {
			url: jsonUIPanel.mediaURL,
			isVideo: jsonUIPanel.isVideo ?? false,
		};
	}
}
UIPanelMedia.schema = {
	url: { type: Types.String, default: '' },

	// false for static image, true for video
	isVideo: { type: Types.Boolean, default: false },
};

/**
 * Helper component that keeps track of resources used in UIPanelComponent,
 * even if the components are removed.
 *
 * Please do not manually add this component to any entities.
 */
export class UIPanelResources extends SystemStateComponent {}

UIPanelResources.schema = {
	/**
	 * @type {UIPanel}
	 */
	uiPanel: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.Object3D}
	 */
	uiBackground: { type: Types.Ref, default: undefined },

	/**
	 * @type {THREE.Mesh} The mesh that the video / image should be played on, if one is attached to the UI panel
	 */
	mediaSurface: { type: Types.Ref, default: undefined },

	/**
	 * @type {HTMLImageElement | HTMLVideoElement}
	 */
	mediaElement: { type: Types.Ref, default: undefined },
};
