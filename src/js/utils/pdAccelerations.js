/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export function computePDAcceleration(
	currentValue,
	currentVelocity,
	targetValue,
	targetVelocity,
	frequency,
	damping,
	dt,
) {
	const ks = frequency * frequency * 36.0;
	const kd = frequency * damping * 9.0;
	const scale = 1.0 / (1.0 + kd * dt + ks * dt * dt);

	const ksI = ks * scale;
	const kdI = (kd + ks * dt) * scale;

	return (
		ksI * (targetValue - currentValue) +
		kdI * (targetVelocity - currentVelocity)
	);
}

/**
 *
 * @param {THREE.Vector3} currentValue
 * @param {THREE.Vector3} currentVelocity
 * @param {THREE.Vector3} targetValue
 * @param {THREE.Vector3} targetVelocity
 * @param {*} frequency - time to reach target
 * @param {*} damping - damping force, if less than 1.0 will produce overshoot
 * @param {*} dt - delta time
 */
export function applyPDVec3(
	currentValue,
	currentVelocity,
	targetValue,
	targetVelocity,
	frequency,
	damping,
	dt,
) {
	let accelX = computePDAcceleration(
		currentValue.x,
		currentVelocity.x,
		targetValue.x,
		targetVelocity.x,
		frequency,
		damping,
		dt,
	);
	let accelY = computePDAcceleration(
		currentValue.y,
		currentVelocity.y,
		targetValue.y,
		targetVelocity.y,
		frequency,
		damping,
		dt,
	);
	let accelZ = computePDAcceleration(
		currentValue.z,
		currentVelocity.z,
		targetValue.z,
		targetVelocity.z,
		frequency,
		damping,
		dt,
	);

	currentVelocity.x += accelX * dt;
	currentVelocity.y += accelY * dt;
	currentVelocity.z += accelZ * dt;

	currentValue.x += currentVelocity.x * dt;
	currentValue.y += currentVelocity.y * dt;
	currentValue.z += currentVelocity.z * dt;
}

/**
 * this function calculate the speed and value for a new frame to achieve a
 * smooth transition from one scalar value to another.
 * @param {Number} currentValue
 * @param {Number} currentSpeed
 * @param {Number} targetValue
 * @param {Number} targetSpeed
 * @param {*} frequency - determines the time it needs to converge on target.
 * @param {*} damping - damping force, if less than 1.0 will produce overshoot
 * @param {*} dt - delta time
 * @returns
 */
export function applyPDScalar(
	currentValue,
	currentSpeed,
	targetValue,
	targetSpeed,
	frequency,
	damping,
	dt,
) {
	const accel = computePDAcceleration(
		currentValue,
		currentSpeed,
		targetValue,
		targetSpeed,
		frequency,
		damping,
		dt,
	);

	const newSpeed = currentSpeed + accel * dt;

	const newValue = currentValue + newSpeed * dt;

	return [newSpeed, newValue];
}

const STEP_TIME = 0.01;

/**
 * calculate the converging time for given converging criteria
 * EXPENSIVE, DO NOT RUN EVERY FRAME
 * @param {Number} startValue
 * @param {Number} startSpeed
 * @param {Number} targetValue
 * @param {Number} targetSpeed
 * @param {Number} frequency - determines the time it needs to converge on target.
 * @param {Number} damping - damping force, if less than 1.0 will produce overshoot
 * @param {Number} maxBounces - max # of overshoots before considered as converged
 * @param {Number} valueErrorThreshold - value error threshold for converging
 * @param {Number} speedErrorThreshold - speed error threshold for converging
 * @param {Number} maxTime - max time for transition
 * @returns
 */
export function calculatePDConvergingTime(
	startValue,
	startSpeed,
	targetValue,
	targetSpeed,
	frequency,
	damping,
	maxBounces = 2,
	valueErrorThreshold = 0.01,
	speedErrorThreshold = 0.01,
	maxTime = 10,
) {
	let currentSpeed = startSpeed;
	let currentValue = startValue;
	let previousValue = startValue;
	let numBounces = -1;
	for (let i = 0; i < maxTime / STEP_TIME; i++) {
		previousValue = currentValue;
		[currentSpeed, currentValue] = applyPDScalar(
			currentValue,
			currentSpeed,
			targetValue,
			targetSpeed,
			frequency,
			damping,
			STEP_TIME,
		);
		if ((previousValue - targetValue) * (currentValue - targetValue) < 0) {
			numBounces += 1;
		}
		if (numBounces >= maxBounces) {
			return STEP_TIME * (i + 1);
		} else if (
			Math.abs(currentValue - targetValue) < valueErrorThreshold &&
			Math.abs(currentSpeed - targetSpeed) < speedErrorThreshold
		) {
			return STEP_TIME * (i + 1);
		}
	}
	return null;
}

/**
 * calculate the frequency for transition to converge in target time, with given
 * converging criteria
 * EXPENSIVE, DO NOT RUN EVERY FRAME
 * @param {*} startValue
 * @param {*} startSpeed
 * @param {*} targetValue
 * @param {*} targetSpeed
 * @param {Number} damping - damping force, if less than 1.0 will produce overshoot
 * @param {*} targetTime - target time of convergence
 * @param {Number} maxBounces - max # of overshoots before considered as converged
 * @param {Number} valueErrorThreshold - value error threshold for converging
 * @param {Number} speedErrorThreshold - speed error threshold for converging
 * @param {Number} maxTime - max time for transition
 * @param {Number} cycles - higher cycles produce more precise result
 * @returns
 */
export function calculatePDConvergingFrequency(
	startValue,
	startSpeed,
	targetValue,
	targetSpeed,
	damping,
	targetTime,
	maxBounces = 2,
	valueErrorThreshold = 0.01,
	speedErrorThreshold = 0.01,
	maxTime = 10,
	cycles = 2,
) {
	let freq = 1;

	for (let i = 0; i < cycles; i++) {
		let time = calculatePDConvergingTime(
			startValue,
			startSpeed,
			targetValue,
			targetSpeed,
			freq,
			damping,
			maxBounces,
			valueErrorThreshold,
			speedErrorThreshold,
			maxTime,
		);
		freq *= time / targetTime;
	}

	return freq;
}
