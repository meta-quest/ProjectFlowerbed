/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
Auto-generated file.

This is a list of all of the models that are expected in the experience, and where on a localhost server
the experience will look for them.

If you create a localhost server on port 8080 and have models available at any of the URLs expected for each model
(either .gltf or .glb), the experience will use those models instead of the ones included by default in the
built version, allowing you to preview models without needing a fresh build of Flowerbed. If any model doesn't exist
on the localhost server, it'll fall back to the one that's included in the build.

(Also note that this code path will only run if ENABLE_LOCALHOST_ASSETS in src/js/Constants.js is set to true.)

Note that the localhost server needs CORS enabled so that Flowerbed can fetch the models from it; this can be done
with the http-server npm module by running

$ http-server --cors

on the directory with the replacement assets.

Note that some models require specific anchor points or named objects to function; without them, the experience
may fail to run, or that particular model may look incorrect.
*/

export const LocalAssetURLs = {
	BASE_SCENE: [
		'http://localhost:8080/base_scene.gltf',
		'http://localhost:8080/base_scene.glb',
	],
	CAMERA: [
		'http://localhost:8080/camera.gltf',
		'http://localhost:8080/camera.glb',
	],
	PLANT_FLOWER: [
		'http://localhost:8080/plant_flower.gltf',
		'http://localhost:8080/plant_flower.glb',
	],
	PLANT_PANSY_A: [
		'http://localhost:8080/plant_pansy_a.gltf',
		'http://localhost:8080/plant_pansy_a.glb',
	],
	PLANT_PANSY_B: [
		'http://localhost:8080/plant_pansy_b.gltf',
		'http://localhost:8080/plant_pansy_b.glb',
	],
	PLANT_PANSY_C: [
		'http://localhost:8080/plant_pansy_c.gltf',
		'http://localhost:8080/plant_pansy_c.glb',
	],
	PLANT_ROSE_A: [
		'http://localhost:8080/plant_rose_a.gltf',
		'http://localhost:8080/plant_rose_a.glb',
	],
	PLANT_ROSE_B: [
		'http://localhost:8080/plant_rose_b.gltf',
		'http://localhost:8080/plant_rose_b.glb',
	],
	PLANT_ROSE_C: [
		'http://localhost:8080/plant_rose_c.gltf',
		'http://localhost:8080/plant_rose_c.glb',
	],
	PLANT_ROSE_D: [
		'http://localhost:8080/plant_rose_d.gltf',
		'http://localhost:8080/plant_rose_d.glb',
	],
	PLANT_TULIP_A: [
		'http://localhost:8080/plant_tulip_a.gltf',
		'http://localhost:8080/plant_tulip_a.glb',
	],
	PLANT_TULIP_B: [
		'http://localhost:8080/plant_tulip_b.gltf',
		'http://localhost:8080/plant_tulip_b.glb',
	],
	PLANT_TULIP_C: [
		'http://localhost:8080/plant_tulip_c.gltf',
		'http://localhost:8080/plant_tulip_c.glb',
	],
	PLANT_TULIP_D: [
		'http://localhost:8080/plant_tulip_d.gltf',
		'http://localhost:8080/plant_tulip_d.glb',
	],
	PLANT_CARNATION_A: [
		'http://localhost:8080/plant_carnation_a.gltf',
		'http://localhost:8080/plant_carnation_a.glb',
	],
	PLANT_CARNATION_B: [
		'http://localhost:8080/plant_carnation_b.gltf',
		'http://localhost:8080/plant_carnation_b.glb',
	],
	PLANT_DAFFODIL_A: [
		'http://localhost:8080/plant_daffodil_a.gltf',
		'http://localhost:8080/plant_daffodil_a.glb',
	],
	PLANT_DAFFODIL_B: [
		'http://localhost:8080/plant_daffodil_b.gltf',
		'http://localhost:8080/plant_daffodil_b.glb',
	],
	PLANT_SUCCULENT_A: [
		'http://localhost:8080/plant_succulent_a.gltf',
		'http://localhost:8080/plant_succulent_a.glb',
	],
	PLANT_SUCCULENT_B: [
		'http://localhost:8080/plant_succulent_b.gltf',
		'http://localhost:8080/plant_succulent_b.glb',
	],
	PLANT_SUCCULENT_C: [
		'http://localhost:8080/plant_succulent_c.gltf',
		'http://localhost:8080/plant_succulent_c.glb',
	],
	PLANT_FIR: [
		'http://localhost:8080/plant_fir.gltf',
		'http://localhost:8080/plant_fir.glb',
	],
	PLANT_SUGARPINE: [
		'http://localhost:8080/plant_sugarpine.gltf',
		'http://localhost:8080/plant_sugarpine.glb',
	],
	PLANT_ALLIUM_A: [
		'http://localhost:8080/plant_allium_a.gltf',
		'http://localhost:8080/plant_allium_a.glb',
	],
	PLANT_ALLIUM_B: [
		'http://localhost:8080/plant_allium_b.gltf',
		'http://localhost:8080/plant_allium_b.glb',
	],
	PLANT_ALLIUM_C: [
		'http://localhost:8080/plant_allium_c.gltf',
		'http://localhost:8080/plant_allium_c.glb',
	],
	PLANT_SUNFLOWER_A: [
		'http://localhost:8080/plant_sunflower_a.gltf',
		'http://localhost:8080/plant_sunflower_a.glb',
	],
	PLANT_SUNFLOWER_B: [
		'http://localhost:8080/plant_sunflower_b.gltf',
		'http://localhost:8080/plant_sunflower_b.glb',
	],
	PLANT_LAVENDER_A: [
		'http://localhost:8080/plant_lavender_a.gltf',
		'http://localhost:8080/plant_lavender_a.glb',
	],
	PLANT_LAVENDER_B: [
		'http://localhost:8080/plant_lavender_b.gltf',
		'http://localhost:8080/plant_lavender_b.glb',
	],
	PLANT_CHERRYBLOSSOM: [
		'http://localhost:8080/plant_cherryblossom.gltf',
		'http://localhost:8080/plant_cherryblossom.glb',
	],
	PLANT_OAK: [
		'http://localhost:8080/plant_oak.gltf',
		'http://localhost:8080/plant_oak.glb',
	],
	PLANT_NASTURTIUM_A: [
		'http://localhost:8080/plant_nasturtium_a.gltf',
		'http://localhost:8080/plant_nasturtium_a.glb',
	],
	PLANT_NASTURTIUM_B: [
		'http://localhost:8080/plant_nasturtium_b.gltf',
		'http://localhost:8080/plant_nasturtium_b.glb',
	],
	PLANT_NASTURTIUM_C: [
		'http://localhost:8080/plant_nasturtium_c.gltf',
		'http://localhost:8080/plant_nasturtium_c.glb',
	],
	SEEDBOX: [
		'http://localhost:8080/seedbox.gltf',
		'http://localhost:8080/seedbox.glb',
	],
	SEEDBAG_PANSY_A: [
		'http://localhost:8080/seedbag_pansy_a.gltf',
		'http://localhost:8080/seedbag_pansy_a.glb',
	],
	SEEDBAG_PANSY_B: [
		'http://localhost:8080/seedbag_pansy_b.gltf',
		'http://localhost:8080/seedbag_pansy_b.glb',
	],
	SEEDBAG_PANSY_C: [
		'http://localhost:8080/seedbag_pansy_c.gltf',
		'http://localhost:8080/seedbag_pansy_c.glb',
	],
	SEEDBAG_ROSE_A: [
		'http://localhost:8080/seedbag_rose_a.gltf',
		'http://localhost:8080/seedbag_rose_a.glb',
	],
	SEEDBAG_ROSE_B: [
		'http://localhost:8080/seedbag_rose_b.gltf',
		'http://localhost:8080/seedbag_rose_b.glb',
	],
	SEEDBAG_ROSE_C: [
		'http://localhost:8080/seedbag_rose_c.gltf',
		'http://localhost:8080/seedbag_rose_c.glb',
	],
	SEEDBAG_ROSE_D: [
		'http://localhost:8080/seedbag_rose_d.gltf',
		'http://localhost:8080/seedbag_rose_d.glb',
	],
	SEEDBAG_TULIP_A: [
		'http://localhost:8080/seedbag_tulip_a.gltf',
		'http://localhost:8080/seedbag_tulip_a.glb',
	],
	SEEDBAG_TULIP_B: [
		'http://localhost:8080/seedbag_tulip_b.gltf',
		'http://localhost:8080/seedbag_tulip_b.glb',
	],
	SEEDBAG_TULIP_C: [
		'http://localhost:8080/seedbag_tulip_c.gltf',
		'http://localhost:8080/seedbag_tulip_c.glb',
	],
	SEEDBAG_TULIP_D: [
		'http://localhost:8080/seedbag_tulip_d.gltf',
		'http://localhost:8080/seedbag_tulip_d.glb',
	],
	SEEDBAG_CARNATION_A: [
		'http://localhost:8080/seedbag_carnation_a.gltf',
		'http://localhost:8080/seedbag_carnation_a.glb',
	],
	SEEDBAG_CARNATION_B: [
		'http://localhost:8080/seedbag_carnation_b.gltf',
		'http://localhost:8080/seedbag_carnation_b.glb',
	],
	SEEDBAG_DAFFODIL_A: [
		'http://localhost:8080/seedbag_daffodil_a.gltf',
		'http://localhost:8080/seedbag_daffodil_a.glb',
	],
	SEEDBAG_DAFFODIL_B: [
		'http://localhost:8080/seedbag_daffodil_b.gltf',
		'http://localhost:8080/seedbag_daffodil_b.glb',
	],
	SEEDBAG_SUCCULENT_A: [
		'http://localhost:8080/seedbag_succulent_a.gltf',
		'http://localhost:8080/seedbag_succulent_a.glb',
	],
	SEEDBAG_SUCCULENT_B: [
		'http://localhost:8080/seedbag_succulent_b.gltf',
		'http://localhost:8080/seedbag_succulent_b.glb',
	],
	SEEDBAG_SUCCULENT_C: [
		'http://localhost:8080/seedbag_succulent_c.gltf',
		'http://localhost:8080/seedbag_succulent_c.glb',
	],
	SEEDBAG_FIR: [
		'http://localhost:8080/seedbag_fir.gltf',
		'http://localhost:8080/seedbag_fir.glb',
	],
	SEEDBAG_SUGARPINE: [
		'http://localhost:8080/seedbag_sugarpine.gltf',
		'http://localhost:8080/seedbag_sugarpine.glb',
	],
	SEEDBAG_ALLIUM_A: [
		'http://localhost:8080/seedbag_allium_a.gltf',
		'http://localhost:8080/seedbag_allium_a.glb',
	],
	SEEDBAG_ALLIUM_B: [
		'http://localhost:8080/seedbag_allium_b.gltf',
		'http://localhost:8080/seedbag_allium_b.glb',
	],
	SEEDBAG_ALLIUM_C: [
		'http://localhost:8080/seedbag_allium_c.gltf',
		'http://localhost:8080/seedbag_allium_c.glb',
	],
	SEEDBAG_SUNFLOWER_A: [
		'http://localhost:8080/seedbag_sunflower_a.gltf',
		'http://localhost:8080/seedbag_sunflower_a.glb',
	],
	SEEDBAG_SUNFLOWER_B: [
		'http://localhost:8080/seedbag_sunflower_b.gltf',
		'http://localhost:8080/seedbag_sunflower_b.glb',
	],
	SEEDBAG_LAVENDER_A: [
		'http://localhost:8080/seedbag_lavender_a.gltf',
		'http://localhost:8080/seedbag_lavender_a.glb',
	],
	SEEDBAG_LAVENDER_B: [
		'http://localhost:8080/seedbag_lavender_b.gltf',
		'http://localhost:8080/seedbag_lavender_b.glb',
	],
	SEEDBAG_CHERRYBLOSSOM: [
		'http://localhost:8080/seedbag_cherryblossom.gltf',
		'http://localhost:8080/seedbag_cherryblossom.glb',
	],
	SEEDBAG_OAK: [
		'http://localhost:8080/seedbag_oak.gltf',
		'http://localhost:8080/seedbag_oak.glb',
	],
	SEEDBAG_NASTURTIUM_A: [
		'http://localhost:8080/seedbag_nasturtium_a.gltf',
		'http://localhost:8080/seedbag_nasturtium_a.glb',
	],
	SEEDBAG_NASTURTIUM_B: [
		'http://localhost:8080/seedbag_nasturtium_b.gltf',
		'http://localhost:8080/seedbag_nasturtium_b.glb',
	],
	SEEDBAG_NASTURTIUM_C: [
		'http://localhost:8080/seedbag_nasturtium_c.gltf',
		'http://localhost:8080/seedbag_nasturtium_c.glb',
	],
	MODE_TILES: [
		'http://localhost:8080/mode_tiles.gltf',
		'http://localhost:8080/mode_tiles.glb',
	],
	CAMERA_ACTION_TILES: [
		'http://localhost:8080/camera_action_tiles.gltf',
		'http://localhost:8080/camera_action_tiles.glb',
	],
	WATERING_CAN: [
		'http://localhost:8080/watering_can.gltf',
		'http://localhost:8080/watering_can.glb',
	],
	FAUNA_BLUE_BUTTERFLY: [
		'http://localhost:8080/fauna_blue_butterfly.gltf',
		'http://localhost:8080/fauna_blue_butterfly.glb',
	],
	FAUNA_DUCK_A: [
		'http://localhost:8080/fauna_duck_a.gltf',
		'http://localhost:8080/fauna_duck_a.glb',
	],
	FAUNA_DUCK_B: [
		'http://localhost:8080/fauna_duck_b.gltf',
		'http://localhost:8080/fauna_duck_b.glb',
	],
	FAUNA_FISH_A: [
		'http://localhost:8080/fauna_fish_a.gltf',
		'http://localhost:8080/fauna_fish_a.glb',
	],
	FAUNA_FISH_B: [
		'http://localhost:8080/fauna_fish_b.gltf',
		'http://localhost:8080/fauna_fish_b.glb',
	],
	FAUNA_ORANGE_BUTTERFLY: [
		'http://localhost:8080/fauna_orange_butterfly.gltf',
		'http://localhost:8080/fauna_orange_butterfly.glb',
	],
	FAUNA_RABBIT: [
		'http://localhost:8080/fauna_rabbit.gltf',
		'http://localhost:8080/fauna_rabbit.glb',
	],
	FAUNA_SEAGULL_FLYING: [
		'http://localhost:8080/fauna_seagull_flying.gltf',
		'http://localhost:8080/fauna_seagull_flying.glb',
	],
	FAUNA_SEAGULL_STANDING: [
		'http://localhost:8080/fauna_seagull_standing.gltf',
		'http://localhost:8080/fauna_seagull_standing.glb',
	],
	FAUNA_SQUIRREL: [
		'http://localhost:8080/fauna_squirrel.gltf',
		'http://localhost:8080/fauna_squirrel.glb',
	],
	HAND_REST_LEFT: [
		'http://localhost:8080/hand_rest_left.gltf',
		'http://localhost:8080/hand_rest_left.glb',
	],
	UI_BACKGROUND: [
		'http://localhost:8080/ui_background.gltf',
		'http://localhost:8080/ui_background.glb',
	],
	UI_LONG_BACKGROUND: [
		'http://localhost:8080/ui_long_background.gltf',
		'http://localhost:8080/ui_long_background.glb',
	],
	UI_TOOLTIP: [
		'http://localhost:8080/ui_tooltip.gltf',
		'http://localhost:8080/ui_tooltip.glb',
	],
	DEV_PREVIEW: [
		'http://localhost:8080/dev_preview.gltf',
		'http://localhost:8080/dev_preview.glb',
	],
};
