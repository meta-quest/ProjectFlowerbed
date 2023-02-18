###
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.
###

import bpy
import bmesh
from mathutils import Vector, Matrix

# moves an object from one collection to another
def move(name, o):
    # unlink from old collections
    for c in o.users_collection:
        c.objects.unlink(o)
    # make a new collection and link to it
    coll = bpy.data.collections.get(name)
    if not coll:
        coll = bpy.data.collections.new(name)
        scene.collection.children.link(coll)
    coll.objects.link(o)

def delete_collection_hierarchy(collection_name):
    coll = bpy.data.collections.get(collection_name)
    if not coll:
        return

    for obj in coll.objects:
        bpy.data.objects.remove(obj, do_unlink=True)

    bpy.data.collections.remove(coll)

# Returns the collection an object belongs to.
# Note that this is the single **immediate** collection, and won't
# check for collections further up in the hierarchy.
# Unfortunately, getting recursive collections check is a painstaking process in Blender
# see https://blender.stackexchange.com/questions/146685/how-to-obtain-the-parent-of-a-collection-using-python
def is_object_in_collection(name, o):
    for c in o.users_collection:
        if (c.name == name):
            return True
    return False

# Returns the center point of the object's bounding box
# (vs the origin point, which can be separate from the mesh)
def get_bbox_center(o):
    local_bbox_center = 0.125 * sum((Vector(b) for b in o.bound_box), Vector())
    global_bbox_center = o.matrix_world @ local_bbox_center
    return global_bbox_center

def add_custom_tag(o, tag, value=1):
    o[tag] = value
    
def should_create_collider(o):
    if o.type != 'MESH':
        return False
    if "gltf" in o.name:
        return False
    return True

# creates a collider that is a direct duplicate of an object
# used for colliders that need concave elements
def create_copy_collider(o):
    if not should_create_collider(o):
        return None
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    copy = o.copy()
    
    me = bpy.data.meshes.new("%s collider" % me.name)
    bm.to_mesh(me)
    copy.name = "%s_collider" % o.name
    copy.data = me
    add_custom_tag(copy, "collider")

    return copy

# creates a collider that is a convex hull of the original object
def create_hull(o):
    if not should_create_collider(o):
        return None
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    copy = o.copy()
    copy.modifiers.clear()
    # create convex hull
    me = bpy.data.meshes.new("%s convexhull" % me.name)
    ch = bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.delete(
            bm,
            geom=ch["geom_unused"] + ch["geom_interior"],
            context='VERTS',
            )
    bm.to_mesh(me)
    copy.name = "%s_collider" % o.name
    copy.data = me
    add_custom_tag(copy, "collider")

    return copy

# creates a collider that is a cylinder (pointing upwards, positive z in Blender, positive y in THREE.JS)
# that encompasses the area of the object
def create_cylinder_collider(o):
    if not should_create_collider(o):
        return None
    height = o.dimensions.z
    height_buffer = 0.2

    # average of the horizontal dimensions
    radius = (o.dimensions.x + o.dimensions.y) / 4

    center = get_bbox_center(o)

    bpy.ops.mesh.primitive_cylinder_add(
      radius = radius,
      depth = height + height_buffer,
      location = center
    )

    cyl = bpy.context.object
    cyl.name = "%s_collider" % o.name
    add_custom_tag(cyl, "collider")

    return cyl

# creates an empty with the same location, rotation, and scale as the
# target object
def create_transform(o):
    empty = bpy.data.objects.new( "empty", None )
    empty.matrix_world  = o.matrix_world
    empty.name = o.name
    return empty

def get_objects_in_collection(collection_name):
    collection = bpy.data.collections.get(collection_name)
    if not collection:
        return []
    return collection.all_objects
    
context = bpy.context
scene = context.scene
ob = context.object

for o in bpy.data.objects:
    if o.active_material:
        o.active_material.use_backface_culling = True

# Any named object with 'gltf' in the name will be replaced by a version from an external
# GLTF, so we don't need to export anything but their transforms here.
delete_collection_hierarchy('GLTFLinks')
links = []
for o in bpy.data.objects:
    if "gltf" in o.name and not is_object_in_collection('GLTFLinks', o):
        o.hide_set(True)
        links.append(o)

for o in links:
    empty = create_transform(o)
    scene.collection.objects.link(empty)
    move("GLTFLinks", empty)

# Remove the Colliders collection so we can recreate it
delete_collection_hierarchy('Colliders')

# create colliders for all objects in obstacle and ground
floraRocks = get_objects_in_collection("FloraAndRocks")
for o in floraRocks:
    if o.hide_get():
        continue
    
    # don't create colliders for grass
    if "grass" in o.name:
        continue
    
    collider = create_copy_collider(o)
    if (collider == None):
        continue
    scene.collection.objects.link(collider)
    move("Colliders", collider)

decorations = get_objects_in_collection("Decorations")
for o in decorations:
    if o.hide_get():
        continue
    collider = create_copy_collider(o)
    if (collider == None):
        continue
    
    # we can plant in the planters
    # TODO: planters should eventually be separated into their own GLTF
    # and so we can remove this code then.
    if is_object_in_collection("Planters", o) or is_object_in_collection("Planters_Long", o) or is_object_in_collection("Planters_Circular", o):
        add_custom_tag(collider, "plantable")
    
    scene.collection.objects.link(collider)
    move("Colliders", collider)
    
ground = get_objects_in_collection("Traversables")
for o in ground:
    if o.hide_get():
        continue
    collider = create_copy_collider(o)
    if (collider == None):
        continue
    scene.collection.objects.link(collider)
    add_custom_tag(collider, "teleport")
    move("Colliders", collider)

terrain = get_objects_in_collection("TerrainPieces")
for o in terrain:
    if o.hide_get():
        continue
    collider = create_copy_collider(o)
    if (collider == None):
        continue
    scene.collection.objects.link(collider)
    add_custom_tag(collider, "teleport")
    if not "Road" in o.name:
        add_custom_tag(collider, "plantable")
    move("Colliders", collider)


# reset transforms for all colliders.
colliders = bpy.data.collections.get("Colliders")
bpy.ops.object.select_all(action='DESELECT')
for o in colliders.all_objects:
    o.select_set(True)

bpy.ops.object.transform_apply(location = False, scale = True, rotation = True)
