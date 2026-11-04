# Tool schemas for Claude. Keep descriptions free of hidden scene facts.
TOOLS = [
    {
        "name": "look",
        "description": "Use the latest robot camera image supplied in the conversation. A fresh capture is taken after movement or turning.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
    {
        "name": "move",
        "description": "Move forward or backward by the requested distance in metres. A collision stops motion and applies the engine's recovery behavior.",
        "input_schema": {
            "type": "object",
            "properties": {
                "distance": {"type": "number", "minimum": -1.0, "maximum": 1.0}
            },
            "required": ["distance"],
            "additionalProperties": False,
        },
    },
    {
        "name": "turn",
        "description": "Turn in place in degrees. Positive means right; negative means left. The turn may stop early after a collision.",
        "input_schema": {
            "type": "object",
            "properties": {
                "degrees": {"type": "number", "minimum": -90, "maximum": 90}
            },
            "required": ["degrees"],
            "additionalProperties": False,
        },
    },
    {
        "name": "pickup",
        "description": "Attempt to pick up an object within reach and forward alignment. Returns success or failure only.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
    {
        "name": "drop",
        "description": "Release the held object and report whether it landed in the marked zone and the final task result.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
    {
        "name": "get_state",
        "description": "Read the robot's current state, pose, holding flag, retry count, collision flag, and task result.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
]
