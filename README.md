# Project Flowerbed

An immersive WebXR gardening experience written on top of THREE.JS.

## Running the Project

This project uses `yarn 1` as the package manager, and `webpack 5` as the build tool. Run:

```
$ yarn install
$ yarn run serve
```

to set up the local webpack dev server.

You can access the dev server locally by pointing a web browser to `https://127.0.0.1:8081` (on Windows) or `https://0.0.0.0:8081` (on Mac). Note the `https`; WebXR requires a secure connection and doesn't work over `http`.

### Viewing the Project on Headset

If your Meta Quest headset is connected to the same wifi network as your computer, you can visit `https://<computer ip address>:8081/` directly on your headset to see Project Flowerbed running on it.

Alternatively, you can connect your headset to your computer using a usb cable, and execute this command on your computer:
```
$ adb reverse tcp:8081 tcp:8081
```

Now access https://localhost:8081/ on your oculus browser, and you should see Project Flowerbed run.

## Code Structure

The code for the Project Flowerbed experience can all be found in the `src` directory. This includes the CSS and HTML of the 2D page (found in `src/styles` and `src/subpages`), as well as all of the ingame logic (in `src/js`). Project Flowerbed uses an ECS architecture, and most of the data / components are available in `src/js/components`, and logic (as systems running per-frame) in `src/js/systems`.

The code for the 3D model asset pipeline can be found in the `asset_pipeline` directory, which is run separately from the experience itself.

There is also some code in the `server` directory for saving and loading gardens on the cloud rather than via local storage; this was a prototype that used Amazon's AWS Lambdas to connect to a database, and is not currently in use in Project Flowerbed. However, the code remains as a resource, and is referenced in some disabled systems.

## Modifying Assets

Source files for art and audio assets can be found in the `content` directory, and generally should be modified in there.

Any content that is modified in the `content` directory _must_ go through the **asset pipeline**, which will then create a (usually) compressed version in the `src/assets` directory -- this version is the one that is picked up for use in the experience.

Note that some assets do **not** have a version in the `content` directory, and don't have any extra processing -- such as images or UI definitions.

Different types of source files have different processes for the asset pipeline:

### 3D Models

```
$ yarn run compress:gltfs
```

All 3D models are found in `content/models` are saved as `.gltf`s from Blender (not `.glb`s) with **Custom Properties included**. The asset pipeline will compress them and convert textures to `ktx2` basis textures, and saved with the same name in the same directory under `src/assets/models`.

### Audio

```
$yarn run compress:audio
```

All sounds and music can be found in `content/audio`, and are compressed with `ffmpeg` and saved in `src/assets/audio`.

### Video

```
$yarn run compress:video
```

Similarly to audio, video is compressed with `ffmpeg`, then saved to `src/assets/video`.

## License

The code for Project Flowerbed is licenced under the **MIT Licence**, as found in the LICENSE file.

Assets (in the `content` folder, as well as built versions in the `src/assets` folder) have their own licenses.
