/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { PlayerStateComponent } from 'src/js/components/PlayerStateComponent';
import { SessionComponent } from '../../components/SessionComponent';
import { System } from 'ecsy';
import { THREEGlobalComponent } from 'src/js/components/THREEGlobalComponent';
import { getOnlyEntity } from 'src/js/utils/entityUtils';
import { registerSystemsAfterReady } from '../../ECSYConfig';

export class EnterVRTransitionSystem extends System {
	init() {
		this.mask = null;
		this.maskTimer = 0;

		this.hasRegisteredSystems = false;
	}

	execute(delta, _time) {
		if (!this.mask) {
			this._createMask();
		}

		const sessionState = getOnlyEntity(this.queries.session).getComponent(
			SessionComponent,
		);
		if (sessionState.isExperienceOpened) {
			this.maskTimer += delta;
			this.mask.visible = true;
		}
		if (this.maskTimer > 2) {
			this.mask.material.opacity = 0;
			this.mask.visible = false;
		} else if (this.maskTimer > 1) {
			this.mask.material.opacity = 2 - this.maskTimer;

			if (!this.hasRegisteredSystems) {
				registerSystemsAfterReady(this.world);
				this.hasRegisteredSystems = true;
			}
		}
	}

	_createMask() {
		this.queries.player.results.forEach((entity) => {
			const playerHead = entity.getComponent(PlayerStateComponent).playerHead;
			this.mask = new THREE.Mesh(
				new THREE.SphereGeometry(0.4, 32, 16),
				new THREE.MeshBasicMaterial({
					color: 0x000000,
					side: THREE.BackSide,
					transparent: true,
					depthWrite: false,
				}),
			);
			this.mask.renderOrder = 1000;
			this.mask.material.depthTest = false;
			this.mask.material.depthWrite = false;
			this.mask.frustumCulled = false;

			playerHead.add(this.mask);
		});
	}
}

EnterVRTransitionSystem.queries = {
	gameManager: { components: [THREEGlobalComponent] },
	session: { components: [SessionComponent] },
	player: { components: [PlayerStateComponent] },
};
