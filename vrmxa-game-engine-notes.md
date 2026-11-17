## VRMXG Game Engine
We need a proper game engine for threejs that understands our VRMXA format and takes advantages of the features it offers.  The game engine lives outside of the game builder and enables the interactive capabilities that can be exposed by the UI and essentially delivers the world environment.

### VRMXI - Game Items
Similar to characters game items have properties that extend outside of their shape.  Each should have internal animations that can travel with it as well as information about what type of item it is. i.e. Doors, Loot box, Vehichle.  Additionally an item may contain information about it's bounding box

### Physics engine
We will need a physics engine similar to what other game engines 

### Bounding boxes with colliders:
We should support standard box styles and shapes

### RayCast:
We need a proper system for detecting user interactions

### Particle system
Built on threejs we should be able to bring in a rich particle system with existing tools

### Camera
We should support a variety of standard game style cameras that can deliver images to related viewports

### Input devices
We should support a variety of input sources starting with the keyboard and mouse and extending into different types of controllers and potentially integration with camera and gesture detections

### MCP
We need to expose the capabilites provided by the game engine so agents like claude can utilize and understand what capablities are provided by the engine to assist in game building.

### NPC a.i.
We want a system that allows for autonomous characters to interact in our environments in a variety of standard game roles.


### Notes:
The engine will be used by most of our applications and the actual game development UI can start minimally for testing purposes.  We will use the cameras and other world items to produce anime shorts, product spokesmodels using our avatars and other various dev.



