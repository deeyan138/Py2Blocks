**PyBlocks** is an AI-powered visual Python programming platform designed to make coding easier for beginners by combining **Gemma 4, Blockly, and real Python code**.

The project provides **two main ways** for users to create programs.

**First method – Prompt to Program:**
The user gives a natural-language prompt, such as **“Create a program to add two numbers.”**

The prompt is sent to **Gemma 4** through our Node.js backend.

Gemma generates structured JSON containing the **Python code and Blockly representation**.

This response is saved as **`code.json`**.

The frontend reads this JSON and converts the Blockly data into **visual Blockly blocks**, while also displaying the generated **Python code**.

The user can then run the program and see the **output**.

**Flow:**
**Prompt → Gemma 4 → `code.json` → Blockly Blocks + Python Code → Run → Output**

**Second method – Blocks to Program:**
The user can directly create or modify a program using **Blockly blocks**.

PyBlocks converts the blocks into **Python code**.

The generated Python code can then be executed, and the user receives the **program output**.

**Flow:**
**Blockly Blocks → Python Code → Run → Output**

Gemma is also integrated into the **PyBlocks UI** to assist the user with understanding and working with their blocks and generated code.

For example, if the user creates blocks representing **10 + 5**, PyBlocks can generate:

`print(10 + 5)`

and the output will be:

`15`

Our current system converts supported Python operations into normal Blockly blocks.

If Gemma generates an unsupported or complex operation, we use a **`buffer_block` placeholder** so that the conversion process can continue instead of completely failing.

Therefore, the main idea of PyBlocks is to create a bridge between **natural language, visual programming, and real executable Python**.

The complete concept is:

**Prompt → Gemma 4 → JSON → Blockly + Python Code → Run → Output**

or

**Blockly → Python Code → Run → Output**
