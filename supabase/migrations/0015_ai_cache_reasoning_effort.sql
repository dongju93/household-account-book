-- A model's reasoning effort changes its generation policy, so cached output is
-- reusable only when both model and effort match the current deployment.
--
-- Keep this nullable for legacy rows: assigning them a guessed default would
-- incorrectly make some old generations eligible for cache hits. The gateway
-- treats NULL as a miss and overwrites the row with the current parsed effort.
alter table ai_insight_cache
add column reasoning_effort text;