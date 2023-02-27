# Flowerbed Content 

This stores **raw** assets that are later transformed with various scripts and compressed before being used in Woodland proper.

## models

This folder contains all of the `.blend` and *uncompressed* `.gltf` (and `.glb`) files for the project. Subfolders are set up for different types of models.

Blendfiles and uncompressed GLTFs should live side by side; various scripts can distinguish between them later, as needed.

To compress models, run
```
$ yarn run compress:gltfs
```
from the project directory. Note that all compressed models will end up in the `src/assets/models` directory, with the directory structure mirroring how they're defined in the `content/models` folder.

## License

All content, unless noted otherwise in their respective sub-directories, are licensed under the [**CC BY 4.0** license](https://creativecommons.org/licenses/by/4.0/), as described by the LICENSE file in this directory.
