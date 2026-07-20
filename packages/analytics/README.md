# @appkit/analytics

App-agnostic dashboard analytics built from production query and visualization patterns:

- application-authored semantic source and field catalogues;
- parsed formula ASTs with a strict function whitelist;
- tenant-bound, parameterized Postgres query compilation;
- typed flat and pivot result contracts with dense pivot construction;
- fifteen visualization definitions, renderability checks, and chart specs;
- tokenized threshold, discrete, and scale conditional formatting; and
- schema-discovered semantic entities that stay independent of a domain catalogue.

Import browser-safe types, parsing, catalogue helpers, and visualization metadata
from `@appkit/analytics`. Import `compileQuery` from `@appkit/analytics/server`.
The package never accepts raw user SQL and never owns an application's domain
catalogue.
