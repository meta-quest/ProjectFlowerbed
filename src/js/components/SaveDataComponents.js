/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Component, TagComponent, Types } from 'ecsy';

/**
 * If an entity is tagged with SavableObject, they are serialized
 * whenever the garden is saved.
 * Every component on that entity is serialized, and components can
 * implement `serialize`, `deserialize` and `afterSerialize` for custom behavior
 * when the garden is saved or loaded.
 */
export class SavableObject extends TagComponent {}

/**
 * Saves a component's data into JSON. By default, all numbers, strings, and bools are saved as-is,
 * and refs are silently discarded.
 * @returns {Object} a Javacript object representing the parsed JSON data of the component.
 */
Component.prototype.serialize = function () {
	return serializeComponentDefault(this);
};

/**
 * Loads a component's data from JSON and sets the properties of the current
 * component according to that JSON data
 * @param {*} jsonData - a Javascript object representing the already-parsed JSON data of the component
 */
Component.prototype.deserialize = function (jsonData) {
	return deserializeComponentDefault(this, jsonData);
};

/**
 * OPTIONAL: This function is called after the component is deserialized and added to the ECSY world
 * on an entity. This can be used to modify other components in the same entity, or to add objects to the
 * scene after the component is loaded.
 * @param {Entity} entity the entity that was deserialized
 * @param {THREE.Scene} scene the scene that the entity belongs to
 * @param {import("./AssetDatabaseComponent")} assetDatabase reference to the singleton asset database, if models or other assets should be added to the scene
 */
Component.prototype.afterDeserialize = function (
	_entity,
	_scene,
	_assetDatabase,
) {
	// no-op - override this
};

/**
 * The default serialize function used when a custom one has not been defined. It serializes all number, boolean, and string parameters
 * and drops all refs with a warning.
 * @param {Component} component the component to serialize
 * @param {boolean} suppressWarning set to true if you want the default serialization behavior (which drops Ref component parameters) without
 * creating a warning about those dropped parameters.
 */
export const serializeComponentDefault = (
	component,
	suppressWarning = false,
) => {
	let serializedComponent = {};
	const schema = component.constructor.schema;
	for (const key in schema) {
		const schemaValue = schema[key];
		if (schemaValue.type === Types.Ref) {
			// refs are by default ignored -- we'll need to handle them specifically.
			if (!suppressWarning) {
				console.warn(
					`Save garden: Trying to serialize a key named ${key} that is a ref, which will silently be dropped. Relevant component: `,
					component,
				);
			}

			continue;
		}
		serializedComponent[key] = component[key];
	}
	return serializedComponent;
};

/**
 * The default deserialize function
 * @param {Component} component The component to deserialize.
 * @param {*} componentData a Javascript object representing the already-parsed JSON data of the component
 */
export const deserializeComponentDefault = (component, componentData) => {
	const schema = component.constructor.schema;
	for (const key in schema) {
		if (componentData[key]) {
			component[key] = componentData[key];
		}
	}
};
