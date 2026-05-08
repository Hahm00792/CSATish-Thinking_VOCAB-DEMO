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

EXAMPLES:
English word: apple
Correct meaning(s): 사과
Student's answer: 사과
{"correct":true,"reason":"정확히 일치합니다."}

English word: beautiful
Correct meaning(s): 아름다운, 예쁜
Student's answer: 예쁘다
{"correct":true,"reason":"문법적 형태는 다르지만 의미는 동일합니다."}

English word: run
Correct meaning(s): 달리다, 뛰다
Student's answer: 달리기
{"correct":true,"reason":"명사형이지만 '달리다'와 같은 핵심 의미를 가집니다."}

English word: happy
Correct meaning(s): 행복한
Student's answer: 즐거운
{"correct":false,"reason":"'행복한'과 '즐거운'은 유사하지만 핵심 의미가 다릅니다."}

English word: book
Correct meaning(s): 책
Student's answer: 공책
{"correct":false,"reason":"'책'과 '공책'은 다른 의미를 가집니다."}

Reply ONLY with JSON, no other text:
{"correct":true,"reason":"reason in Korean"}
or
{"correct":false,"reason":"reason in Korean"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            maxOutputTokens: 200, 
            temperature: 0.2, // 유연성 향상을 위해 0.2로 조정
            responseMimeType: "application/json" // JSON 응답 강제
          }
        })
      }
    );

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      return res.status(500).json({ error: 'No response from AI', raw: JSON.stringify(data) });
    }

    // responseMimeType을 사용했으므로, 응답은 항상 유효한 JSON 문자열입니다.
    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    return res.status(200).json(result);

  } catch (error) {
    console.error("Gemini API error:", error);
    return res.status(500).json({ error: error.message || 'AI 채점 중 오류 발생' });
  }
}
