/**
 * Dictionary service querying https://api.dictionaryapi.dev/api/v2/entries/en/<word>
 * All requests run asynchronously without blocking the UI thread.
 */

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  definition: string;
}

export async function lookupWord(rawWord: string): Promise<DictionaryEntry | null> {
  const word = rawWord.trim().toLowerCase().replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
  if (!word || word.length < 1) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const first = data[0];
    const resolvedWord = first.word || word;
    const phonetic =
      first.phonetic ||
      first.phonetics?.find((p: any) => p && typeof p.text === 'string' && p.text.trim())?.text ||
      undefined;

    let definition = '';
    let partOfSpeech = '';

    for (const meaning of first.meanings || []) {
      if (Array.isArray(meaning.definitions) && meaning.definitions.length > 0) {
        const defObj = meaning.definitions.find((d: any) => d && typeof d.definition === 'string' && d.definition.trim());
        if (defObj) {
          definition = defObj.definition.trim();
          partOfSpeech = meaning.partOfSpeech || '';
          break;
        }
      }
    }

    if (!definition) {
      return null;
    }

    return {
      word: resolvedWord,
      phonetic,
      partOfSpeech,
      definition,
    };
  } catch (_err) {
    // Network offline, timeout, or abort
    return null;
  }
}
