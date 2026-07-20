# @appkit/analytics

App-agnostic dashboard analytics extracted from OpenBooks and BeaconHS:

- application-authored semantic source and field catalogues;
- parsed formula ASTs with a strict function whitelist;
- tenant-bound, parameterized Postgres query compilation;
- shared query-result and visualization contracts; and
- the visualization registry consumed by `@appkit/ui`.

Import browser-safe types, parsing, catalogue helpers, and visualization metadata
from `@appkit/analytics`. Import `compileQuery` from `@appkit/analytics/server`.
The package never accepts raw user SQL and never owns an application's domain
catalogue.
