---
'@braedonsaunders/appkit-ui': minor
---

`SubtabNav` gains a sliding active indicator that glides between tabs on the same spring the `Tabs` segmented control already uses.

Every detail/drawer subtab bar in the suite previously marked its active tab with a static full-width border that snapped from tab to tab. The indicator is now a shared-layout pill that travels to whichever tab is selected, so switching sections reads as movement rather than a cut. The call surface is unchanged — same props, same roles, same labels — and the indicator renders in the static markup, so server-rendered pages show the selection before hydration. Reduced-motion users get an instant swap instead of the glide.
