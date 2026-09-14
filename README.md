# Project Mechanica

> An interactive playground for understanding physics through simulation and experimentation.

Project Mechanica is being built around a simple idea: **physics is easier to understand when you can actually see what is happening.**

A lot of physics is taught through equations, diagrams, and problem solving. Those are important, but they don't always make the underlying physical behaviour intuitive. Mechanica aims to bridge that gap by letting users interact with physical systems and see how changing their parameters affects what happens.

## What it is

Mechanica is an interactive physics simulation platform currently in its early prototype stage.

The goal is to eventually support a wide range of physical systems, from simple motion to more complex systems involving interactions between multiple objects.

The current prototype starts with projectile motion, where users can change parameters and observe the resulting motion.

## Current Status

The project is currently in the **prototype / architecture development stage**.

The basic simulation pipeline is working, but the current architecture is mainly designed around relatively simple physics where an analytical solution can be calculated.

That approach won't scale well to more complex systems such as:

- Collisions
- Damped motion
- Coupled systems
- Systems with multiple interacting objects
- Other physics that need to be calculated iteratively

Because of this, one of the current priorities is redesigning the core simulation architecture around a more general timestep-based model.

## Current Architecture

The project is currently separated into several major parts:

**Module Resolver**  
Determines which physics modules are relevant to a simulation.

**Solvers**  
Calculate the physical behaviour of the system.

**Engine**  
Manages the simulation state and execution.

**Visual Representation**  
Converts the physical state into the visual objects and properties required by the scene.

**Renderer**  
Draws the resulting scene for the user.

The architecture is still evolving as the project moves from a simple prototype toward a more general simulation system.

## Why I'm Building It

I started Mechanica because I kept coming back to the same problem with physics:

**Knowing an equation doesn't always mean you understand what the system is actually doing.**

I want Mechanica to make that physical behaviour easier to explore.

Instead of only asking:

> "What is the answer?"

the idea is to also let the user ask:

> "What actually happens if I change this?"

## Development Philosophy

Mechanica is still being built, so the code and architecture will change.

I'm intentionally keeping the project modular so that individual physics modules can evolve without the entire system becoming tightly coupled.

I'm also using AI as part of my development workflow, particularly for implementation, debugging, and exploring ideas. However, the architecture and design decisions are made deliberately and documented as the project develops.

## Roadmap

There is still a lot to figure out.

Some of the things I'm working toward include:

- A more general simulation engine
- Iterative physics solvers
- Better state and timestep management
- More physics modules
- Interactive parameter changes during simulation
- More expressive visual representations
- Better tools for experimenting with physical systems
- Eventually, support for much more complex simulations

The exact implementation will evolve as I learn more and as the limitations of the current architecture become clearer.

## Project Structure

```text
app/                    Application layer
core/                   Core simulation logic
modules/                Individual physics modules
renderer/               Rendering
scene/                  Scene representation
ui/                     UI and styling
docs/                   Project documentation