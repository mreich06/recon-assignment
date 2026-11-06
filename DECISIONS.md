I will documents the decisions I made in this project, the way I used AI, the mistakes I saw the agent make, an open questions I have as I go along.

I created an AGENTS.md file that improves agent output and have the agent adhere to certain rules that I set, such as read-only git commits 

I decided I'll keep the state in a local JSON file since the findings will be small at the moment, and it is faster to set up under the 3 hour limit. I would switch to SQLite once there is more data, or several people use the tool at once - it currently runs once a day so no need to worry about contention for now

My general rule with using AI is that I make the high level system design decisions, brainstorming what kinds of problems we will encounter in the data, what my steps will be, and how I will test each step along the way to confirm that what I did worked. The agent writes the code and I review it to make sure the implementation is clean, correct and efficient


Step 1: Data exploration
I asked the agent to write scripts to inspect the data and catch which issues it found

It wrote 3 scripts that go through the exports, trace each unmatched row to see if it turns up in another day's file and test if the rows without an ID can be paired by amount and time

These are the findings in the data
- Currency is in EUR, no zero/negative amounts. Each merchant name maps between provider and ledger 
- Rows with an ID are booked 0-90s after capture, but 11 without IDs take 98-160 seconds. 
- One €249.00 provider row (no ID) has two possible ledger rows.
- Two provider rows without an ID (€21.00 Albert Heijn and €150.34 Ziggo) have no ledger match.
- Provider ID pt_9f6ceae92af2 was captured twice, 4 s apart, but the ledger has only one row for it.
- Three transactions captured at 23:59:59 appear in both days' provider files, so day 2 must not report them as new.
- Ten rows from 03-01 only turn up in 03-02's files, so a missing row often means "not arrived yet" rather than a real gap.
- There are 8 amount mismatches: +€0.35 three times (a fee?), two decimal-point slips (×10), two swapped digits, and one rounded amount.
- Rows still unmatched after both days: on 03-01, 6 only in the provider file and 4 only in the ledger; on 03-02, 4 provider-only and 3 ledger-only.
- The daily totals don't match: the ledger is €358.16 higher on 03-01 and €576.16 lower on 03-02.

Questions
- Was pt_9f6ceae92af2 a double charge or duplicate?
- What's the ledger's daily cut off? UTC or local midnight?
- Is the 35 cent different a fee or mismatch?
- If a row is unmatched for more than a day, do we show it as pending or missing?

I thought about what decisions this would entail
- Fallback matching needs a buffer window - let's say 5 minutes
- We should report the €249.00 provider row with two possible ledger rows as potential double booking to finance so it can investigate
- Match by ID first, then by amount and merchant within 5 minutes
- Don't automatch for pt_9f6ceae92af2 - report as possible double charge 
- Track rows by ID across files so rows that appear in both days files aren't reported new on day 2. Missing rows should show as resolved if they show up in the next days report 
- Since rows sometimes show up the next day, we can mark it as pending. Then if it's still unmatced for more than a day, mark as missing 

Step 2: Core - Match transactions by ID
I decided there will be 4 categories - matched, provider-only, ledger-only, ambiguous, noId

I asked the agent to write a pure function that takes the provider and ledger transactions and sorts them into the 5 categories

I saw a few problems:
- duplicate Id is only flagged when the other side has the id too. So if a duplicate ID shows in provider but not at all in ledger, nothing marks that as a duplicate. Mark as ambiguous

Gaps in tests
- No test for a duplicate ID on the ledger side
- No test for the duplicate ID issue found above
- No empty input test
- A test with a mixed collection of rows with and without IDs

The tests also had some overlapping testing so I trimmed down to ensuring it tests core behavior and edge cases

Step 3: Core - Fallback matching
I asked the agent to write the fallback match code and tests, using the decisions I made during the data exploration. 

Rows without ID are matched by exact amount + merchant and a ledger booking 0–5 minutes after capture
A pair is matched only when each row is the other's only candidate
When rows match for the same candidates, they report together as ambiguous
Rows with no candidates are reported unmatched

It looks correct, and I see the €249.00 Amazon row is flagged as ambiguous with the two ledger rows that might be matching. The €21.00 Albert Heijn and €150.34 Ziggo have no ledger row. All the other no ID rows match 

I questioned whether learning merchant names was needed. Ignoring merchants gave the same results. I kept the check because a wrong automatic match hides a discrepancy and unknown merchant would create something someone has to review


Tests - I decided to trim the "an unknown provider descriptor is not guessed" test since its testing same behavior as "no match when amount, merchant or timing differ" test