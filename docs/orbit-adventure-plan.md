# Grounded adventure implementation plan

## Release 1: persistent army
Remove all catch-up relocation and speed boosts. Preserve fights independently of queen distance. Assign scouts up to 280 m ahead, rear guards behind, close guards beside the queen. Keep deterministic ground separation and role-based health. Show signed distances and combat state in the squad HUD. These changes are implemented in this release. Bull removal and the previous showcase/branding release must reach main together.

## Release 2: navigation and route map
Build a navigation graph from authored terrain, ledges, rope anchors and safe landings. Edges carry required jump velocity, climbing reach and traversal duration. A* chooses physically reachable routes. Jump trajectories use gravity and take-off velocity; rope traversal uses a constrained pendulum and visible grip/release phases. Do not extend jumps or relocate blocked soldiers. Reserve crossing occupancy so climbers queue without overlapping. Ground and canopy tracks share the same world x coordinate on a compact map, with queen, soldier, wounded, combat and objective markers. Long-separated soldiers continue simulation. The current distance HUD is an interim locator, not this two-track map.

## Release 3: first adventure — prisoner transfer
Author a prison, patrol route, key carrier and exit. Objective states: discover, obtain key or breach, free prisoner, escort to extraction. The transport deadline advances only during live simulation. Missing it changes the objective to interception rather than silently failing. Prisoner movement uses the same navigation graph. Two solutions must work without requiring a specific surviving companion. Completing the level requires extraction, not enemy elimination.

## Later adventures
Floodgates and buoyant crossing platforms; a counterweighted lift; stealth through a watch patrol; a runaway carriage with braking; a storm crossing with measured wind forces; a village evacuation. Each level combines one main objective with one environmental complication and an optional rescue. Introduce mechanics individually before combining them. No cloud walking or unsupported jumps.

## Acceptance gates
Test queen departures at 30, 60, 150 and 300 m with no coordinate discontinuity, fade or speed increase. Verify separated combat continues. Test body separation in crowds and near walls. Validate every required crossing for every companion class, including alternate routes. Run each mission with missing squad roles. Verify keyboard/touch map controls, reduced motion, pause, death, checkpoint and route restoration. Build, lint, unit/integration checks and production profiling precede deployment. The previous mobile Lighthouse score was 70; 95 remains an unresolved target.

## Remaining work
Navigation graph, physical rope traversal for companions, interactive two-track map, and the prisoner-transfer mission are not implemented by Release 1. Do not describe them as shipped.

## First playable adventure
The village now requires freeing the Knight and extracting together. Reaching the level end alone no longer completes it. This is the initial prison-break objective; the timed transport, alternate key route and navigation-dependent escort missions remain planned.
