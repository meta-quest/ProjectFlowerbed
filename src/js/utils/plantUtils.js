/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const getPlantMeshId = (plantType) => {
	return `PLANT_${plantType.toLocaleUpperCase()}`;
};

export const getSeedbagMeshId = (plantType) => {
	return `SEEDBAG_${plantType.toLocaleUpperCase()}`;
};
