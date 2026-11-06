I will documents the decisions I made in this project, the way I used AI, the mistakes I saw the agent make, an open questions I have as I go along.

I created an AGENTS.md file that improves agent output and have the agent adhere to certain rules that I set, such as read-only git commits 

I decided I'll keep the state in a local JSON file since the findings will be small at the moment, and it is faster to set up under the 3 hour limit. I would switch to SQLite once there is more data, or several people use the tool at once - it currently runs once a day so no need to worry about contention for now

