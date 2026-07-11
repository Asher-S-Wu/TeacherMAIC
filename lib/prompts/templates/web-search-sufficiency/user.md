## User Requirement

{{requirement}}

## Round Context

- Current round number: {{currentRound}}
- Maximum rounds: {{maxRounds}}

## Candidate Pool Digest (titles + URLs collected so far)

{{candidatesDigest}}

## Scraped Pages Digest (summaries of pages already read)

{{scrapedDigest}}

## Task

Decide whether the collected research is sufficient to satisfy the requirement.

Output JSON directly with `sufficient`, `reason`, and `missingAspects` only.
Example sufficient: {"sufficient":true,"reason":"覆盖核心概念与最新版本信息","missingAspects":[]}
Example insufficient: {"sufficient":false,"reason":"缺少 2025 年最新政策细节","missingAspects":["2025 政策原文","权威机构解读"]}
