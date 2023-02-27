/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { Object3DComponent } from '../components/Object3DComponent';
import { ObjectFollowerComponent } from '../components/ObjectFollowerComponent';
import { UIPanelComponent } from '../components/UIPanelComponent';

/**
 * Helper function to create a tooltip given an empty entity. It'll attach all the required components
 * and optionally target it to the viewerTransform
 * @param {*} entity - the entity to attach the tooltip components to
 * @param {*} jsonObject - JSON definition for the tooltip's content
 * @param {*} targetObject - the object that the tooltip should follow. Optional.
 * @param {*} targetOffset - the offset from the targetObject, in viewerTransform's local coordinates. If no targetObject was set, the tooltip will be at this global position
 * @param {*} viewerTransform - optional, add a reference to viewerTransform here to parent the tooltip to viewerTransform
 */
export const createTooltip = (
	entity,
	jsonObject,
	targetObject,
	targetOffset,
	viewerTransform,
) => {
	const uiPanelComponentParams = UIPanelComponent.createFromJSON(jsonObject);

	if (targetOffset && !targetObject) {
		uiPanelComponentParams.uiPanel.position.copy(targetOffset);
	}

	entity.addComponent(Object3DComponent, {
		value: uiPanelComponentParams.uiPanel,
	});
	entity.addComponent(UIPanelComponent, {
		...uiPanelComponentParams,
		shouldLookAtCamera: true,
		parent: viewerTransform,
	});

	if (targetObject) {
		entity.addComponent(ObjectFollowerComponent, {
			target: targetObject,
			offset: targetOffset,
			isChildOfViewerTransform: viewerTransform !== undefined,
			velocity: new THREE.Vector3(),
			shouldMoveImmediately: true,
		});
	}
};
