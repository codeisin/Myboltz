import path from "path";
import dotenv from "dotenv";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { BASE_PROMPT, getSystemPrompt } from "./prompts";
import {basePrompt as nodeBasePrompt} from "./defaults/node";
import {basePrompt as reactBasePrompt} from "./defaults/react";
import cors from "cors";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Avoid importing SDK resource types that may not exist in this SDK version.
function getTextFromContent(content: any): string {
  return (content?.[0] && typeof content[0].text === 'string') ? content[0].text : '';
}

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

if (!anthropicApiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY in be/.env");
}

const anthropic = new Anthropic({
    apiKey: anthropicApiKey
});
const CLAUDE_MODEL = "claude-sonnet-4-6";
const app = express();
app.use(cors())
app.use(express.json())

function getAnthropicErrorMessage(error: unknown) {
    if (error instanceof Anthropic.APIError) {
        return `Anthropic API error (${error.status}): ${error.message}`;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "Unknown Anthropic API error";
}

app.post("/template", async (req, res) => {
    try {
        const prompt = req.body.prompt;

        const response = await anthropic.messages.create({
            messages: [{
                role: 'user', content: prompt
            }],
            model: CLAUDE_MODEL,
            max_tokens: 200,
            system: "Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra"
        })

        const answer = getTextFromContent(response.content); // react or node
        if (answer == "react") {
            res.json({
                prompts: [BASE_PROMPT, `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
                uiPrompts: [reactBasePrompt]
            })
            return;
        }

        if (answer === "node") {
            res.json({
                prompts: [`Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
                uiPrompts: [nodeBasePrompt]
            })
            return;
        }

        res.status(403).json({message: "You cant access this"})
        return;
    } catch (error) {
        console.error(getAnthropicErrorMessage(error));
        res.status(500).json({ message: getAnthropicErrorMessage(error) });
    }

})

app.post("/chat", async (req, res) => {
    try {
        const messages = req.body.messages;
        const response = await anthropic.messages.create({
            messages: messages,
            model: CLAUDE_MODEL,
            max_tokens: 8000,
            system: getSystemPrompt()
        })

        console.log(response);

        res.json({
            response: getTextFromContent(response.content)
        });
    } catch (error) {
        console.error(getAnthropicErrorMessage(error));
        res.status(500).json({ message: getAnthropicErrorMessage(error) });
    }
})

app.listen(3000, () => {
    console.log("Backend listening on http://localhost:3000");
});

