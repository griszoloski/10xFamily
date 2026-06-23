---
name: refactor-opportunities
description: Analyze technical debt and structural risks, then propose refactoring opportunities.
---
Read the analysis:
context/changes/{change-id}/research.md - a record of the technical debt
and structural risks of this repository.
Treat its findings as collected evidence: do not re-derive them, build upon them. If it refers to other artifacts (repo map, previous research), read them as a priority.

List every problem the report notes, regardless of its label (debt, risk, hotspot, finding).
Classify each: a CANDIDATE is a problem whose fix would change the code's structure; everything else (e.g., missing test, documentation gap) is not a candidate - keep it as input for feasibility and cost assessment.
List and classify the candidates at the beginning of the output so I can audit them. Then, examine each candidate with three sub-agents; all work in exploration mode, without making changes:

1. Current shape - confirm in the code what shape the candidate has today: where the logic lives, how responsibilities are mixed, what abstractions or dependencies already exist. Cite file:line. Mark each statement as evidence / inference / unknown.

2. History and intentionality - determine WHY the code has this shape: ADRs and design documents, if they exist; otherwise, git archaeology (git log -L, blame, justifications in commits and PRs). Verdict per candidate: conscious limitation (a foundational decision) vs accidental complexity - or honestly mark as unknown if it's hard to determine.
3. Migration feasibility - what an incremental, reversible path would require (existing abstraction vs new abstraction), what results from blast radius data from the report, what safeguards and tests already exist around it (check CI configuration), and what would be the first prerequisite step.

Hard boundaries:
- No code changes. No refactoring. Evidence before interpretation.
- Do not design the target architecture
- beyond naming the adequate target shape per candidate.
- If the true fix for a candidate is a redesign of business concepts, not code structure - state this and stop - this is a subject for another, later analysis.
- Where data is missing, write unknown - do not fill gaps with plausible guesses.
Synthesis (after reports from all three sub-agents): save research.md in this change's folder. Per candidate: current shape (with evidence), intentionality verdict, feasibility notes.
Conclude with a "Refactor opportunities" section with the 2-3 strongest candidates ranked - for each: current → target shape, why it deserves this spot (cost of debt vs cost of change), blast radius, sketch of an incremental path, first prerequisite step. Also list considered and rejected candidates, with a brief summary of why. Evaluate based on evidence. DO NOT ask me for selection, confirmation, or approval - finish by saving the complete report.
The ranking is a proposal for a separate planning session that will take place after my review.