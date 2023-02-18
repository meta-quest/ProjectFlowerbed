/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, Types } from 'ecsy';

export class SeedboxComponent extends Component {
	/**
	 * sets current plant group by type
	 * @param {number} plantType
	 * @see plantUtils.PLANT_TYPE
	 */
	selectPlantGroup(plantType) {
		this.currentPlantIndex = this.plantGroups.indexOf(plantType);
	}

	getCurrentPlantGroup() {
		return this.plantGroups[this.currentPlantIndex];
	}
}

SeedboxComponent.schema = {
	/**
	 * @type {THREE.Object3D[][]} - 2D array of seed packet objects
	 */
	pages: { type: Types.Ref, default: undefined },
	/**
	 * @type {THREE.Object3D[]} - array of packet slot objects
	 */
	slots: { type: Types.Ref, default: undefined },
	/**
	 * @type {number} - id of active page
	 */
	currentPageId: { type: Types.Number, default: 0 },
	/**
	 * @type {string[]} - array of plant type strings
	 */
	plantGroups: { type: Types.Ref, default: undefined },
	/**
	 * @type {number} index of current plant in the plantGroups array
	 */
	currentPlantIndex: { type: Types.Number, default: 0 },
	/**
	 * @type {boolean} - indicates whether seedbox is being looked at
	 */
	inFocus: { type: Types.Boolean, default: false },
	/**
	 * @type {boolean} - indicates whether player's controller is hovering over seedbox to select seed
	 */
	inSelectionZone: { type: Types.Boolean, default: false },
	/**
	 * @type {boolean} - indicate whether player's controller is pointing at seedbox
	 */
	isPointedAt: { type: Types.Boolean, default: false },
};

export class SeedComponent extends Component {}

SeedComponent.schema = {
	/**
	 * @type {number}
	 * @see plantUtils.PLANT_TYPE
	 */
	plantType: { type: Types.Number },
	/**
	 * @type {THREE.Mesh}
	 * @default undefined
	 */
	collider: { type: Types.Ref, default: undefined },
	/**
	 * @type {number}
	 * @default 0
	 */
	pageId: { type: Types.Number, default: 0 },
};

export class SeedbagComponent extends Component {}

SeedbagComponent.schema = {
	/**
	 * @type {number}
	 * @see plantUtils.PLANT_TYPE
	 */
	plantType: { type: Types.Number },
	/**
	 * @type {number}
	 * @default 0
	 */
	pageId: { type: Types.Number, default: 0 },
};

export class SeedboxButtonComponent extends Component {}

SeedboxButtonComponent.ROLES = {
	CLOSE: 0,
	NEXT_PAGE: 1,
	PREV_PAGE: 2,
};

SeedboxButtonComponent.schema = {
	/**
	 * colliderMesh is transparent but has the same size as the textureMeshes
	 * colliderMesh has a slight z-offset, we use it for raycasting
	 * @type {THREE.Mesh}
	 * @default undefined
	 */
	colliderMesh: { type: Types.Ref, default: undefined },
	/**
	 * @type {THREE.Mesh}
	 * @default undefined
	 */
	defaultTextureMesh: { type: Types.Ref, default: undefined },
	/**
	 * @type {THREE.Mesh}
	 * @default undefined
	 */
	hoveredTextureMesh: { type: Types.Ref, default: undefined },
	/**
	 * @type {THREE.Mesh}
	 * @default undefined
	 */
	pressedTextureMesh: { type: Types.Ref, default: undefined },
};
