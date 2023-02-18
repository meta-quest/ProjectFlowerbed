/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { PLANT_TYPES } from './Constants';

export const PLANT_CONFIG = {
	default: {
		baselineScale: 3,
		growthDuration: 1,
		heightMargin: 0.15,
		rotationRange: {
			minY: 0.0,
			maxY: Math.PI * 2.0,
		},
		growthConfig: {
			root: {
				delayedStartPercentage: 0,
				pdDamping: 0.8,
				pdFrequency: 0.9,
				margin: 0.2,
			},
			x: {
				delayedStartPercentage: 0,
				pdDamping: 0.8,
				pdFrequency: 0.9,
				margin: 0,
			},
			y: {
				delayedStartPercentage: 0,
				pdDamping: 0.8,
				pdFrequency: 0.9,
				margin: 0,
			},
			z: {
				delayedStartPercentage: 0,
				pdDamping: 0.8,
				pdFrequency: 0.9,
				margin: 0,
			},
			w: {
				delayedStartPercentage: 0,
				pdDamping: 0.8,
				pdFrequency: 0.9,
				margin: 0,
			},
		},
		convergenceDuration: 0.25,
		convergenceFrequency: 5,
		convergenceDamping: 2,
		shrinkDuration: 1,
		shrinkConfig: {
			root: {
				delayedStartPercentage: 0,
				pdDamping: 0.8,
				pdFrequency: 0.9,
			},
			x: {
				delayedStartPercentage: 0,
				pdDamping: 0.8,
				pdFrequency: 0.9,
			},
			y: {
				delayedStartPercentage: 0,
				pdDamping: 0.8,
				pdFrequency: 0.9,
			},
			z: {
				delayedStartPercentage: 0,
				pdDamping: 0.8,
				pdFrequency: 0.9,
			},
			w: {
				delayedStartPercentage: 0,
				pdDamping: 0.8,
				pdFrequency: 0.9,
			},
		},
	},
};

// Pansy - Red Flower slot in the seed box
PLANT_CONFIG[PLANT_TYPES.PANSY_A] = {
	baselineScale: 1.3,
	growthDuration: 1.5,
	heightMargin: 0.15,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// base leaf
			delayedStartPercentage: 0,
			pdDamping: 0.35,
			pdFrequency: 2.5,
			margin: 0.1,
		},
		w: {
			// more leaves
			delayedStartPercentage: 0.15,
			pdDamping: 0.4,
			pdFrequency: 2.5,
			margin: 0.1,
		},
		x: {
			//flower - double
			delayedStartPercentage: 0.5,
			pdDamping: 0.3,
			pdFrequency: 3.0,
			margin: 0.2,
		},
		y: {
			// double flower
			delayedStartPercentage: 0.65,
			pdDamping: 0.3,
			pdFrequency: 3.0,
			margin: 0.2,
		},
		z: {
			//flower - single
			delayedStartPercentage: 0.8,
			pdDamping: 0.25,
			pdFrequency: 3.0,
			margin: 0.2,
		},
	},
	convergenceDuration: 0.55,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.9,
		},
		x: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.9,
		},
		y: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.9,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.9,
		},
		w: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.9,
		},
	},
};
PLANT_CONFIG[PLANT_TYPES.PANSY_B] = PLANT_CONFIG[PLANT_TYPES.PANSY_A];
PLANT_CONFIG[PLANT_TYPES.PANSY_C] = PLANT_CONFIG[PLANT_TYPES.PANSY_A];

PLANT_CONFIG[PLANT_TYPES.TULIP_A] = {
	baselineScale: 0.75,
	growthDuration: 1.5,
	heightMargin: 0.0,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// stem
			delayedStartPercentage: 0.0,
			pdDamping: 0.35,
			pdFrequency: 3.0,
			margin: 0.05,
		},
		y: {
			//lowest leaf
			delayedStartPercentage: 0.2,
			pdDamping: 0.35,
			pdFrequency: 3.0,
			margin: 0.05,
		},
		w: {
			// middle leaf
			delayedStartPercentage: 0.4,
			pdDamping: 0.35,
			pdFrequency: 3.0,
			margin: 0.05,
		},
		z: {
			// upper leaf
			delayedStartPercentage: 0.6,
			pdDamping: 0.35,
			pdFrequency: 3.0,
			margin: 0.05,
		},
		x: {
			//flower
			delayedStartPercentage: 0.8,
			pdDamping: 0.25,
			pdFrequency: 3.0,
			margin: 0.1,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};

PLANT_CONFIG[PLANT_TYPES.TULIP_B] = PLANT_CONFIG[PLANT_TYPES.TULIP_A];
PLANT_CONFIG[PLANT_TYPES.TULIP_C] = PLANT_CONFIG[PLANT_TYPES.TULIP_A];
PLANT_CONFIG[PLANT_TYPES.TULIP_D] = PLANT_CONFIG[PLANT_TYPES.TULIP_A];

PLANT_CONFIG[PLANT_TYPES.CARNATION_A] = {
	baselineScale: 0.8,
	growthDuration: 1.5,
	heightMargin: 0.0,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// stem + base leaves
			delayedStartPercentage: 0.0,
			pdDamping: 0.45,
			pdFrequency: 2.0,
			margin: 0.05,
		},
		w: {
			// middle leaves
			delayedStartPercentage: 0.25,
			pdDamping: 0.2,
			pdFrequency: 3.0,
			margin: 0.25,
		},
		z: {
			// upper leaves
			delayedStartPercentage: 0.325,
			pdDamping: 0.2,
			pdFrequency: 3.0,
			margin: 0.25,
		},
		y: {
			//first flower
			delayedStartPercentage: 0.65,
			pdDamping: 0.15,
			pdFrequency: 3.0,
			margin: 0.3,
		},
		x: {
			//second flower - single
			delayedStartPercentage: 0.725,
			pdDamping: 0.15,
			pdFrequency: 3.0,
			margin: 0.3,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};
PLANT_CONFIG[PLANT_TYPES.CARNATION_B] = PLANT_CONFIG[PLANT_TYPES.CARNATION_A];

PLANT_CONFIG[PLANT_TYPES.DAFFODIL_A] = {
	baselineScale: 0.65,
	growthDuration: 1.2,
	heightMargin: 0.1,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// stems
			delayedStartPercentage: 0.0,
			pdDamping: 0.4,
			pdFrequency: 1.8,
			margin: 0.05,
		},
		w: {
			// leaves
			delayedStartPercentage: 0.2,
			pdDamping: 0.5,
			pdFrequency: 2.0,
			margin: 0.02,
		},
		z: {
			// first flower
			delayedStartPercentage: 0.65,
			pdDamping: 0.15,
			pdFrequency: 3.0,
			margin: 0.2,
		},
		y: {
			// second flower
			delayedStartPercentage: 0.7,
			pdDamping: 0.15,
			pdFrequency: 3.0,
			margin: 0.2,
		},
		x: {
			// third
			delayedStartPercentage: 0.75,
			pdDamping: 0.15,
			pdFrequency: 3.0,
			margin: 0.2,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 2,
	convergenceDamping: 1,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};
PLANT_CONFIG[PLANT_TYPES.DAFFODIL_B] = PLANT_CONFIG[PLANT_TYPES.DAFFODIL_A];

PLANT_CONFIG[PLANT_TYPES.SUCCULENT_A] = {
	baselineScale: 4.5,
	growthDuration: 1.7,
	heightMargin: 0.1,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// base
			delayedStartPercentage: 0.0,
			pdDamping: 0.5,
			pdFrequency: 2.0,
			margin: 0.25,
		},

		y: {
			// second outermost
			delayedStartPercentage: 0.15,
			pdDamping: 0.4,
			pdFrequency: 2.0,
			margin: 0.25,
		},

		x: {
			// middle
			delayedStartPercentage: 0.27,
			pdDamping: 0.35,
			pdFrequency: 2.0,
			margin: 0.2,
		},

		w: {
			// second innermost
			delayedStartPercentage: 0.55,
			pdDamping: 0.275,
			pdFrequency: 2.5,
			margin: 0.15,
		},

		z: {
			// innermost
			delayedStartPercentage: 0.67,
			pdDamping: 0.15,
			pdFrequency: 3.5,
			margin: 0.1,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};

PLANT_CONFIG[PLANT_TYPES.SUCCULENT_B] = PLANT_CONFIG[PLANT_TYPES.SUCCULENT_A];
PLANT_CONFIG[PLANT_TYPES.SUCCULENT_C] = PLANT_CONFIG[PLANT_TYPES.SUCCULENT_A];

PLANT_CONFIG[PLANT_TYPES.ALLIUM_A] = {
	baselineScale: 1.3,
	growthDuration: 1.5,
	heightMargin: 0.0,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// stem
			delayedStartPercentage: 0.0,
			pdDamping: 0.6,
			pdFrequency: 1.85,
			margin: 0.1,
		},
		x: {
			// leaves
			delayedStartPercentage: 0.1,
			pdDamping: 0.6,
			pdFrequency: 2.0,
			margin: 0.05,
		},
		y: {
			// more leaves
			delayedStartPercentage: 0.2,
			pdDamping: 0.6,
			pdFrequency: 2.0,
			margin: 0.05,
		},
		w: {
			// even more leaves
			delayedStartPercentage: 0.3,
			pdDamping: 0.6,
			pdFrequency: 2.0,
			margin: 0.05,
		},
		z: {
			// ball
			delayedStartPercentage: 0.55,
			pdDamping: 0.4,
			pdFrequency: 1.7,
			margin: 0.15,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};
PLANT_CONFIG[PLANT_TYPES.ALLIUM_B] = PLANT_CONFIG[PLANT_TYPES.ALLIUM_A];
PLANT_CONFIG[PLANT_TYPES.ALLIUM_C] = PLANT_CONFIG[PLANT_TYPES.ALLIUM_A];

PLANT_CONFIG[PLANT_TYPES.SUNFLOWER_A] = {
	baselineScale: 3.25,
	growthDuration: 1.5,
	heightMargin: 0.0,
	rotationRange: {
		minY: 1.25 * Math.PI,
		maxY: 1.65 * Math.PI,
	},
	growthConfig: {
		root: {
			// stem
			delayedStartPercentage: 0.0,
			pdDamping: 0.8,
			pdFrequency: 1.5,
			margin: 0.05,
		},
		x: {
			// bottom leaves
			delayedStartPercentage: 0.15,
			pdDamping: 0.4,
			pdFrequency: 2.0,
			margin: 0.05,
		},
		z: {
			// middle leaves
			delayedStartPercentage: 0.3,
			pdDamping: 0.4,
			pdFrequency: 2.0,
			margin: 0.05,
		},
		w: {
			// top leaves
			delayedStartPercentage: 0.45,
			pdDamping: 0.4,
			pdFrequency: 2.0,
			margin: 0.05,
		},
		y: {
			// flower
			delayedStartPercentage: 0.6,
			pdDamping: 0.6,
			pdFrequency: 1.4,
			margin: 0.1,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};
PLANT_CONFIG[PLANT_TYPES.SUNFLOWER_B] = PLANT_CONFIG[PLANT_TYPES.SUNFLOWER_A];

PLANT_CONFIG[PLANT_TYPES.LAVENDER_A] = {
	baselineScale: 0.9,
	growthDuration: 1.5,
	heightMargin: 0.0,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// leaves
			delayedStartPercentage: 0.0,
			pdDamping: 0.4,
			pdFrequency: 1.7,
			margin: 0.1,
		},

		y: {
			// 1 flower
			delayedStartPercentage: 0.3,
			pdDamping: 0.5,
			pdFrequency: 1.6,
			margin: 0.05,
		},
		z: {
			// 1 flower
			delayedStartPercentage: 0.42,
			pdDamping: 0.5,
			pdFrequency: 1.6,
			margin: 0.15,
		},
		x: {
			// 1 flowers
			delayedStartPercentage: 0.56,
			pdDamping: 0.53,
			pdFrequency: 1.6,
			margin: 0.05,
		},
		w: {
			// 1 flower
			delayedStartPercentage: 0.7,
			pdDamping: 0.55,
			pdFrequency: 1.6,
			margin: 0.05,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};
PLANT_CONFIG[PLANT_TYPES.LAVENDER_B] = PLANT_CONFIG[PLANT_TYPES.LAVENDER_A];

PLANT_CONFIG[PLANT_TYPES.NASTURTIUM_A] = {
	baselineScale: 1.85,
	growthDuration: 1.5,
	heightMargin: 0.1,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// leaves
			delayedStartPercentage: 0.0,
			pdDamping: 0.4,
			pdFrequency: 1.7,
			margin: 0.1,
		},

		x: {
			// 1 flower
			delayedStartPercentage: 0.3,
			pdDamping: 0.5,
			pdFrequency: 1.6,
			margin: 0.0,
		},
		y: {
			// 1 flower
			delayedStartPercentage: 0.42,
			pdDamping: 0.5,
			pdFrequency: 1.6,
			margin: 0.0,
		},
		z: {
			// 1 flowers
			delayedStartPercentage: 0.56,
			pdDamping: 0.53,
			pdFrequency: 1.6,
			margin: 0.0,
		},
		w: {
			// 1 flower
			delayedStartPercentage: 0.7,
			pdDamping: 0.55,
			pdFrequency: 1.6,
			margin: 0.01,
		},
	},
	convergenceDuration: 1.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};
PLANT_CONFIG[PLANT_TYPES.NASTURTIUM_B] = PLANT_CONFIG[PLANT_TYPES.NASTURTIUM_A];
PLANT_CONFIG[PLANT_TYPES.NASTURTIUM_C] = PLANT_CONFIG[PLANT_TYPES.NASTURTIUM_A];

PLANT_CONFIG[PLANT_TYPES.ROSE_A] = {
	baselineScale: 0.9,
	growthDuration: 1.5,
	heightMargin: 0.1,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// leaves
			delayedStartPercentage: 0.0,
			pdDamping: 0.7,
			pdFrequency: 1.7,
			margin: 0.0,
		},

		x: {
			// 1 flower
			delayedStartPercentage: 0.0,
			pdDamping: 0.5,
			pdFrequency: 1.0,
			margin: 0.05,
		},
		y: {
			// 1 flower
			delayedStartPercentage: 0.1,
			pdDamping: 0.5,
			pdFrequency: 1.0,
			margin: 0.05,
		},
		z: {
			// 1 flowers
			delayedStartPercentage: 0.2,
			pdDamping: 0.5,
			pdFrequency: 1.0,
			margin: 0.05,
		},
		w: {
			// 1 flower
			delayedStartPercentage: 0.3,
			pdDamping: 0.5,
			pdFrequency: 1.0,
			margin: 0.05,
		},
	},
	convergenceDuration: 2.0,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};
PLANT_CONFIG[PLANT_TYPES.ROSE_B] = PLANT_CONFIG[PLANT_TYPES.ROSE_A];
PLANT_CONFIG[PLANT_TYPES.ROSE_C] = PLANT_CONFIG[PLANT_TYPES.ROSE_A];
PLANT_CONFIG[PLANT_TYPES.ROSE_D] = PLANT_CONFIG[PLANT_TYPES.ROSE_A];

// CEDAR HEDGE
PLANT_CONFIG[PLANT_TYPES.FIR] = {
	baselineScale: 0.35,
	growthDuration: 1.75, //3.5,
	heightMargin: 0.05,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// stem + base leaves
			delayedStartPercentage: 0.0,
			pdDamping: 0.975,
			pdFrequency: 0.5,
			margin: 0.05,
		},
		x: {
			// middle leaves
			delayedStartPercentage: 0.1,
			pdDamping: 0.8,
			pdFrequency: 2.0,
			margin: 0.0,
		},
		y: {
			// upper leaves
			delayedStartPercentage: 0.2,
			pdDamping: 0.8,
			pdFrequency: 2.0,
			margin: 0.0,
		},
		z: {
			//first flower
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2.0,
			margin: 0.0,
		},
		w: {
			//second flower - single
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2.0,
			margin: 0.0,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};

PLANT_CONFIG[PLANT_TYPES.CHERRYBLOSSOM] = {
	baselineScale: 0.55,
	growthDuration: 2.75,
	heightMargin: 0.0,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// stem + base leaves
			delayedStartPercentage: 0.0,
			pdDamping: 0.75,
			pdFrequency: 0.6,
			margin: 0.0,
		},
		x: {
			// branches
			delayedStartPercentage: 0.06,
			pdDamping: 0.75,
			pdFrequency: 0.7,
			margin: 0.0,
		},
		y: {
			// more branches
			delayedStartPercentage: 0.13,
			pdDamping: 0.75,
			pdFrequency: 0.7,
			margin: 0.0,
		},
		z: {
			// middle leaves
			delayedStartPercentage: 0.38,
			pdDamping: 0.8,
			pdFrequency: 0.9,
			margin: 0.0,
		},
		w: {
			// upper leaves
			delayedStartPercentage: 0.41,
			pdDamping: 0.8,
			pdFrequency: 0.9,
			margin: 0.0,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};

PLANT_CONFIG[PLANT_TYPES.SUGARPINE] = {
	baselineScale: 0.6,
	growthDuration: 1.75,
	heightMargin: 0.1,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// stem + base leaves
			delayedStartPercentage: 0.0,
			pdDamping: 0.95,
			pdFrequency: 0.35,
			margin: 0.1,
		},
		w: {
			// top branches
			delayedStartPercentage: 0.2,
			pdDamping: 0.3,
			pdFrequency: 2.5,
			margin: 0.1,
		},
		z: {
			// second from top branches
			delayedStartPercentage: 0.35,
			pdDamping: 0.35,
			pdFrequency: 2.25,
			margin: 0.1,
		},
		y: {
			// second from bottom branches
			delayedStartPercentage: 0.5,
			pdDamping: 0.6,
			pdFrequency: 2.25,
			margin: 0.05,
		},
		x: {
			// bottom branches
			delayedStartPercentage: 0.65,
			pdDamping: 0.65,
			pdFrequency: 2.25,
			margin: 0.05,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};

PLANT_CONFIG[PLANT_TYPES.OAK] = {
	baselineScale: 0.55,
	growthDuration: 1.75,
	heightMargin: 0.05,
	rotationRange: {
		minY: 0.0,
		maxY: Math.PI * 2.0,
	},
	growthConfig: {
		root: {
			// stem + base leaves
			delayedStartPercentage: 0.0,
			pdDamping: 0.9,
			pdFrequency: 0.7,
			margin: 0.0,
		},
		x: {
			// top canopy
			delayedStartPercentage: 0.04,
			pdDamping: 0.85,
			pdFrequency: 0.7,
			margin: 0.0,
		},
		y: {
			// upper leaves
			delayedStartPercentage: 0.14,
			pdDamping: 0.85,
			pdFrequency: 1.0,
			margin: 0.0,
		},
		z: {
			//first flower
			delayedStartPercentage: 0.24,
			pdDamping: 0.85,
			pdFrequency: 1.0,
			margin: 0.0,
		},
		w: {
			//second flower - single
			delayedStartPercentage: 0.24,
			pdDamping: 0.95,
			pdFrequency: 1.2,
			margin: 0.0,
		},
	},
	convergenceDuration: 0.75,
	convergenceFrequency: 5,
	convergenceDamping: 2,
	shrinkDuration: 1.5,
	shrinkConfig: {
		root: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 0.8,
		},
		x: {
			delayedStartPercentage: 0.3,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		y: {
			delayedStartPercentage: 0.4,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
		z: {
			delayedStartPercentage: 0,
			pdDamping: 0.8,
			pdFrequency: 3,
		},
		w: {
			delayedStartPercentage: 0.5,
			pdDamping: 0.8,
			pdFrequency: 2,
		},
	},
};
