If you had to make workarouds or came across ideas not directly related to the feature,
do not pursue them. 
Instead, dump them to a dedicated KAIZEN.md file - laconically.

Firmware memory: no lazy or on-demand allocation. Every buffer, cache and table is static (or allocated
once at boot) so the maximum footprint is deterministic; size it for the worst case and fail visibly if
something does not fit, never fall back to another heap.
