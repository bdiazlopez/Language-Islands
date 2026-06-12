import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const CSV_FILE_PATH = path.join(__dirname, 'language_island.csv');

// Configurable LLM Models (must be defined in server environment config)
const GEMINI_MODEL = process.env.GEMINI_MODEL;
const GPT_MODEL = process.env.GPT_MODEL;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Custom CSV Parser (Robust multi-line character parser)
function parseCSV(text) {
  const result = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      i++;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      row.push(current);
      result.push(row);
      row = [];
      current = '';
      if (char === '\r' && text[i + 1] === '\n') {
        i += 2;
      } else {
        i++;
      }
    } else {
      current += char;
      i++;
    }
  }
  
  if (row.length > 0 || current !== '') {
    row.push(current);
    result.push(row);
  }
  
  return result.filter(r => r.some(cell => cell.trim() !== ''));
}

// Helper: Custom CSV Stringifier
function stringifyCSV(rows) {
  return rows.map(row => 
    row.map(val => {
      const str = val === null || val === undefined ? '' : String(val);
      const cleaned = str.replace(/"/g, '""');
      if (cleaned.includes(',') || cleaned.includes('"') || cleaned.includes('\n') || cleaned.includes('\r')) {
        return `"${cleaned}"`;
      }
      return cleaned;
    }).join(',')
  ).join('\n');
}

// API: Get CSV file entries
app.get('/api/csv', (req, res) => {
  try {
    if (!fs.existsSync(CSV_FILE_PATH)) {
      // Create template file with header if not existing
      const initialCSV = stringifyCSV([['Foreign (Formal)', 'Foreign (Informal)', 'Native Tongue', 'Target Language']]);
      fs.writeFileSync(CSV_FILE_PATH, initialCSV, 'utf8');
      return res.json({ success: true, rows: [] });
    }

    const data = fs.readFileSync(CSV_FILE_PATH, 'utf8');
    const allRows = parseCSV(data);
    
    // Slice off header if matching header template
    let rows = allRows;
    if (rows.length > 0 && 
        (rows[0][0]?.toLowerCase() === 'target language' ||
         rows[0][0]?.toLowerCase() === 'foreign (formal)' || 
         rows[0][0]?.toLowerCase() === 'foreign language' || 
         rows[0][0]?.toLowerCase() === 'foreign')) {
      rows = rows.slice(1);
    }
    
    res.json({ success: true, rows });
  } catch (error) {
    console.error('Error reading CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to read CSV file.' });
  }
});

// API: Save CSV file entries
app.post('/api/csv', (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ success: false, error: 'Rows must be an array.' });
    }

    // Format with header (Target Language at the end)
    const dataToWrite = [['Foreign (Formal)', 'Foreign (Informal)', 'Native Tongue', 'Target Language'], ...rows];
    const csvContent = stringifyCSV(dataToWrite);
    
    fs.writeFileSync(CSV_FILE_PATH, csvContent, 'utf8');
    res.json({ success: true });
  } catch (error) {
    console.error('Error writing CSV:', error);
    res.status(500).json({ success: false, error: 'Failed to write CSV file.' });
  }
});

// API: Translate via multiple LLM engines (Gemini, GPT, Claude)
app.post('/api/translate', async (req, res) => {
  try {
    const { text, targetLanguage, nativeLanguage, provider, clientApiKey, customInstructions } = req.body;
    
    if (!text || !targetLanguage) {
      return res.status(400).json({ success: false, error: 'Text and targetLanguage are required.' });
    }

    const activeProvider = (provider || 'gemini').toLowerCase();
    
    // Determine API Key from client or server environment fallback
    let apiKey = clientApiKey;
    if (!apiKey) {
      if (activeProvider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
      else if (activeProvider === 'gpt') apiKey = process.env.GPT_API_KEY;
      else if (activeProvider === 'claude') apiKey = process.env.CLAUDE_API_KEY;
    }

    if (!apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: `API key for ${activeProvider.toUpperCase()} is missing. Please configure it in Settings or server environment.` 
      });
    }

    // Validate model configurations
    if (activeProvider === 'gemini' && !GEMINI_MODEL) {
      return res.status(400).json({ success: false, error: 'GEMINI_MODEL is not defined in the server environment (.env).' });
    }
    if (activeProvider === 'gpt' && !GPT_MODEL) {
      return res.status(400).json({ success: false, error: 'GPT_MODEL is not defined in the server environment (.env).' });
    }
    if (activeProvider === 'claude' && !CLAUDE_MODEL) {
      return res.status(400).json({ success: false, error: 'CLAUDE_MODEL is not defined in the server environment (.env).' });
    }

    const promptText = `For the following input text, perform three tasks:
1. Correct any grammar, casing, spelling, and punctuation errors in the original text to make it pretty, proper, and natural in ${nativeLanguage || 'English'}.
2. Provide the formal/polite translation in ${targetLanguage} that a native speaker would use.
3. Provide the informal/casual/colloquial translation in ${targetLanguage} that a native speaker would use in casual conversations with friends.

${customInstructions ? `Additional Context/Translation Instructions: "${customInstructions}"\n` : ''}
Input Text: "${text}"

Respond ONLY with a JSON object in this format:
{
  "correctedNative": "corrected native text",
  "formal": "translated formal text",
  "informal": "translated informal text"
}
Do NOT include any markdown code blocks, explanations, or extra characters. Output raw JSON.`;

    let translation = '';

    if (activeProvider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Error from Gemini translation service.');
      }

      const result = await response.json();
      translation = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    } else if (activeProvider === 'gpt') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: GPT_MODEL,
          messages: [
            { role: 'system', content: `You are a precise language learning assistant. Correct the native text (casing, punctuation) and translate it into formal and informal variants. Respond ONLY with a JSON object containing "correctedNative", "formal", and "informal".` },
            { role: 'user', content: promptText }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Error from OpenAI (GPT) service.');
      }

      const result = await response.json();
      translation = result.choices?.[0]?.message?.content || '';

    } else if (activeProvider === 'claude') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1000,
          temperature: 0.3,
          system: 'You are a precise language learning assistant. Correct the native text (casing, punctuation) and translate it into formal and informal variants. Respond ONLY with a JSON object containing "correctedNative", "formal", and "informal". Do not include markdown code block formatting.',
          messages: [
            { role: 'user', content: promptText }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Error from Anthropic (Claude) service.');
      }

      const result = await response.json();
      translation = result.content?.[0]?.text || '';
    } else {
      return res.status(400).json({ success: false, error: `Unsupported translation provider: ${provider}` });
    }

    // Helper: Clean and parse JSON from LLM
    function cleanAndParseJSON(rawText) {
      let clean = rawText.trim();
      if (clean.startsWith('```json')) clean = clean.slice(7);
      if (clean.startsWith('```')) clean = clean.slice(3);
      if (clean.endsWith('```')) clean = clean.slice(0, -3);
      clean = clean.trim();
      return JSON.parse(clean);
    }

    let correctedNative = text;
    let formalTranslation = '';
    let informalTranslation = '';

    try {
      const parsed = cleanAndParseJSON(translation);
      correctedNative = parsed.correctedNative || text;
      formalTranslation = parsed.formal || '';
      informalTranslation = parsed.informal || '';
    } catch (parseError) {
      console.warn('Failed to parse JSON response from LLM, using fallback parser.', parseError);
      formalTranslation = translation.trim();
      if (formalTranslation.startsWith('"') && formalTranslation.endsWith('"')) {
        formalTranslation = formalTranslation.slice(1, -1).trim();
      }
      if (formalTranslation.startsWith('“') && formalTranslation.endsWith('”')) {
        formalTranslation = formalTranslation.slice(1, -1).trim();
      }
      if (formalTranslation.startsWith('«') && formalTranslation.endsWith('»')) {
        formalTranslation = formalTranslation.slice(1, -1).trim();
      }
    }

    res.json({ success: true, correctedNative, formal: formalTranslation, informal: informalTranslation });
  } catch (error) {
    console.error('Error during translation:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error during translation.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
