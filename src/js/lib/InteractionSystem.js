/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
	CurvedRay,
	RayComponent,
	ShortRay,
	StraightRay,
} from '../components/RayComponents';
import { Not, System } from 'ecsy';

import { GameStateComponent } from '../components/GameStateComponent';
import { IndicatorRingComponent } from '../components/IndicatorRingComponent';
import { PlayerStateComponent } from '../components/PlayerStateComponent';
import { THREEGlobalComponent } from '../components/THREEGlobalComponent';
import { VrControllerComponent } from '../components/VrControllerComponent';

export class InteractionSystem extends System {
	constructor(world, attributes) {
		super(world, attributes);

		/**
		 * Classes that extends InteractionSystem can override the constructor and
		 * provide a value for this.interactionMode.
		 *
		 * If this.interactionMode is assigned a value, the logic to determine
		 * whether this is the correct interaction mode will run, and depending
		 * on the outcome, onCorrectInteractionMode or onIncorrectInteractionMode
		 * will execute. (so only override those in this case)
		 *
		 * if this.interactionMode is not assigned a value, only onExecute will run
		 * (so only override onExecute in this case)
		 */
		this.interactionMode = null;
		this.wasCorrectInteractionMode = false;
		this.isCorrectInteractionMode = false;
		this.vrPresenting = false;

		this._reset();
	}

	_reset() {
		this.gameStateComponent = null;
		this.threeGlobalComponent = null;
		this.playerStateComponent = null;
		this.targetRayComponent = null;
		this.uiRayComponent = null;
		this.shortRayComponent = null;
		this.indicatorRingComponent = null;

		this.vrControllerComponents = {
			LEFT: null,
			RIGHT: null,
		};
		this.controllerInterfaces = {
			LEFT: null,
			RIGHT: null,
		};
	}

	/**
	 * Overriding the execute method of ECSY System, executing shared queries
	 * Subclasses of InteractionSystem SHOULD NOT implement this function
	 * @param {Number} delta - float number of seconds elapsed since last call
	 * @param {Number} time - float number of seconds elapsed in total
	 */
	execute(delta, time) {
		this._reset();

		this.queries.gameManager.results.forEach((entity) => {
			this.gameStateComponent = entity.getMutableComponent(GameStateComponent);
			this.threeGlobalComponent = entity.getComponent(THREEGlobalComponent);
		});

		this.queries.player.results.forEach((entity) => {
			this.playerStateComponent = entity.getComponent(PlayerStateComponent);
		});

		this.queries.targetRay.results.forEach((entity) => {
			this.targetRayComponent = entity.getMutableComponent(RayComponent);
		});

		this.queries.uiRay.results.forEach((entity) => {
			this.uiRayComponent = entity.getMutableComponent(RayComponent);
		});

		this.queries.shortRay.results.forEach((entity) => {
			this.shortRayComponent = entity.getMutableComponent(RayComponent);
		});

		this.queries.indicatorRing.results.forEach((entity) => {
			this.indicatorRingComponent = entity.getMutableComponent(
				IndicatorRingComponent,
			);
		});

		this.queries.controllers.results.forEach((entity) => {
			let vrControllerComponent = entity.getComponent(VrControllerComponent);
			if (vrControllerComponent.handedness == 'left') {
				this.vrControllerComponents.LEFT = vrControllerComponent;
				this.controllerInterfaces.LEFT =
					vrControllerComponent.controllerInterface;
			} else if (vrControllerComponent.handedness == 'right') {
				this.vrControllerComponents.RIGHT = vrControllerComponent;
				this.controllerInterfaces.RIGHT =
					vrControllerComponent.controllerInterface;
			}
		});

		const vrPresenting = this.threeGlobalComponent.renderer.xr.isPresenting;

		if (vrPresenting && !this.vrPresenting) {
			this.onEnterVR(delta, time);
		}

		this.vrPresenting = vrPresenting;

		if (
			this.gameStateComponent == null ||
			this.threeGlobalComponent == null ||
			this.playerStateComponent == null ||
			this.targetRayComponent == null ||
			this.uiRayComponent == null ||
			this.shortRayComponent == null ||
			this.indicatorRingComponent == null ||
			this.controllerInterfaces.LEFT == null ||
			this.controllerInterfaces.RIGHT == null ||
			this.vrControllerComponents.LEFT == null ||
			this.vrControllerComponents.RIGHT == null
		) {
			return;
		}

		if (this.interactionMode === null) {
			this.onExecute(delta, time);
		} else {
			this.isCorrectInteractionMode =
				!this.gameStateComponent.interactionModeOverridden &&
				this.gameStateComponent.interactionMode === this.interactionMode;
			if (this.isCorrectInteractionMode) {
				if (!this.wasCorrectInteractionMode) {
					this.onEnterMode(delta, time);
				}
				this.onCorrectInteractionMode(delta, time);
				if (this.gameStateComponent.interactionMode !== this.interactionMode) {
					// interaction mode changed during execute, do exitMode immediately
					this.onExitMode(delta, time);
					this.isCorrectInteractionMode = false;
				}
			} else {
				if (this.wasCorrectInteractionMode) {
					this.onExitMode(delta, time);
				}
				this.onIncorrectInteractionMode(delta, time);
			}
			this.wasCorrectInteractionMode = this.isCorrectInteractionMode;
		}
	}

	/**
	 * This function is called when first entering VR, custom logic goes here
	 * @param {Number} delta - float number of seconds elapsed since last call
	 * @param {Number} time - float number of seconds elapsed in total
	 */
	onEnterVR(_delta, _time) {}

	/**
	 * This function is called for each run of world, custom logic goes here
	 * Subclasses of InteractionSystem SHOULD implement this function
	 * if this.interactionMode is not specified
	 * @param {Number} delta - float number of seconds elapsed since last call
	 * @param {Number} time - float number of seconds elapsed in total
	 */
	onExecute(_delta, _time) {
		throw 'Subclasses MUST OVERRIDE onExecute(delta, time)';
	}

	/**
	 * This function is called for each run of world, custom logic goes here
	 * Subclasses of InteractionSystem SHOULD implement this function
	 * if this.interactionMode is specified
	 * @param {Number} delta - float number of seconds elapsed since last call
	 * @param {Number} time - float number of seconds elapsed in total
	 */
	onCorrectInteractionMode(_delta, _time) {}

	/**
	 * This function is called for each run of world, custom logic goes here
	 * Subclasses of InteractionSystem SHOULD implement this function
	 * if this.interactionMode is specified
	 * @param {Number} delta - float number of seconds elapsed since last call
	 * @param {Number} time - float number of seconds elapsed in total
	 */
	onIncorrectInteractionMode(_delta, _time) {}

	/**
	 * if this.interactionMode is specified, this function is called when
	 * entering this interactionMode
	 * @param {Number} delta - float number of seconds elapsed since last call
	 * @param {Number} time - float number of seconds elapsed in total
	 */
	onEnterMode(_delta, _time) {}

	/**
	 * if this.interactionMode is specified, this function is called when
	 * exiting this interactionMode
	 * @param {Number} delta - float number of seconds elapsed since last call
	 * @param {Number} time - float number of seconds elapsed in total
	 */
	onExitMode(_delta, _time) {}
}

InteractionSystem.queries = {
	controllers: { components: [VrControllerComponent] },
	targetRay: { components: [RayComponent, CurvedRay] },
	uiRay: { components: [RayComponent, StraightRay, Not(ShortRay)] },
	shortRay: { components: [RayComponent, StraightRay, ShortRay] },
	indicatorRing: { components: [IndicatorRingComponent] },
	gameManager: { components: [THREEGlobalComponent, GameStateComponent] },
	player: { components: [PlayerStateComponent] },
};

/**
 * this method defines shared queries for all interactionSystems, and add
 * additional queries to existing ones
 * @param {*} additionalQueries
 */
InteractionSystem.addQueries = function (additionalQueries) {
	this.queries = Object.assign(this.queries, additionalQueries);
};
