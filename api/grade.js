export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { word, correctKo, studentAnswer } = req.body;
  if (!word || !correctKo || !studentAnswer) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'No API key' });

  const prompt = `You are grading a Korean vocabulary test.

English word: ${word}
Correct meaning(s): ${correctKo}
Student's answer: ${studentAnswer}

RULES:
- CORRECT if student wrote any ONE of the correct meanings
- CORRECT if true synonym with same core meaning
- CORRECT if only grammatical form differs but meaning is same
- INCORRECT if words are different in meaning even if related
- INCORRECT if completely different meaning

Reply ONLY with JSON, no other text:
{"correct":true,"reason":"reason in Korean"}
or
{"correct":false,"reason":"reason in Korean"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0 }
        })
      }
    );

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      return res.status(500).json({ error: 'No response', raw: JSON.stringify(data) });
    }

    let text = data.candidates[0].content.parts[0].text.trim();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      return res.status(200).json(JSON.parse(jsonMatch[0]));
    }

    const isCorrect = text.includes('"correct":true') || text.includes('"correct": true');
    return res.status(200).json({ correct: isCorrect, reason: '채점 완료' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
