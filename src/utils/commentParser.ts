export interface ParsedCandidate {
    name: string;
    bootSize: string;
    height: string;
    weight: string;
    medicalNotes: string;
  }
  
  const NON_GUEST_KEYWORDS = [
    'minibus', 'caravelle', 'kai 8', 'kai 21', 'breivika', 'radisson',
    'meeting time', 'start', 'closed', 'canceled', 'cancelled', 'training',
    'hotel', 'airbnb', 'tour leader', 'guide', 'call', 'tl'
  ];
  
  /**
   * Extracts all heights/lengths (e.g. 156cm, 184cm, 5'10).
   */
  function extractHeights(text: string): { heights: string[]; cleanText: string } {
    const heights: string[] = [];
    let cleanText = text;
  
    // 1. Matches "184cm", "156 cm", "h: 180"
    const cmRegex = /(?:\(|\b)(?:h|height)?[:\s]*(1[2-9]\d|2[0-2]\d)\s*(?:cm)?(?:\b|\))/gi;
    let match: RegExpExecArray | null;
  
    while ((match = cmRegex.exec(text)) !== null) {
      if (match[1]) {
        // If accompanied by cm/h or is a realistic human/ski height >= 130
        if (/cm|h/i.test(match[0]) || parseInt(match[1], 10) >= 130) {
          heights.push(`${match[1]} cm`);
          cleanText = cleanText.replace(match[0], ' ');
        }
      }
    }
  
    // 2. Matches feet and inches (e.g. 5'11, 6ft 1)
    const ftRegex = /(?:\(|\b)([4-6])\s*(?:ft|'|’)\s*([0-9]|1[0-1])?(?:\s*(?:in|"|”))?(?:\b|\))/gi;
    while ((match = ftRegex.exec(text)) !== null) {
      if (match[1]) {
        const feet = parseInt(match[1], 10);
        const inches = match[2] ? parseInt(match[2], 10) : 0;
        const cm = Math.round((feet * 12 + inches) * 2.54);
        heights.push(`${cm} cm`);
        cleanText = cleanText.replace(match[0], ' ');
      }
    }
  
    return { heights, cleanText: cleanText.trim() };
  }
  
  /**
   * Extracts weights (e.g. 56kg, 75 kg, 165 lbs).
   */
  function extractWeights(text: string): { weights: string[]; cleanText: string } {
    const weights: string[] = [];
    let cleanText = text;
  
    const kgRegex = /(?:\(|\b)(?:w|weight)?[:\s]*(\d{2,3})\s*(?:kg|kilos?|lbs?)(?:\b|\))/gi;
    let match: RegExpExecArray | null;
  
    while ((match = kgRegex.exec(text)) !== null) {
      if (match[1]) {
        const num = parseInt(match[1], 10);
        const isLbs = /lbs?/i.test(match[0]);
        const finalKg = isLbs ? Math.round(num * 0.453) : num;
        weights.push(`${finalKg} kg`);
        cleanText = cleanText.replace(match[0], ' ');
      }
    }
  
    return { weights, cleanText: cleanText.trim() };
  }
  
  /**
   * Extracts shoe sizes (Expanded: 25 to 52, handles EU31, EU34, shoe 42, size 38).
   */
  function extractBootSizes(text: string): { sizes: string[]; cleanText: string } {
    const sizes: string[] = [];
    let cleanText = text;
  
    // Handles "EU34", "EU 31", "shoe 42", "size 38", or pure numbers 25-52
    const shoeRegex = /(?:\(|\b)(?:shoe|size|str\.?|boot|eu)?[:\s]*(2[5-9]|3[0-9]|4[0-9]|5[0-2])(?:\b|\))/gi;
    let match: RegExpExecArray | null;
  
    while ((match = shoeRegex.exec(text)) !== null) {
      if (match[1]) {
        sizes.push(match[1]);
        cleanText = cleanText.replace(match[0], ' ');
      }
    }
  
    return { sizes, cleanText: cleanText.trim() };
  }
  
  function extractMedicalNotes(text: string): { notes: string[]; cleanText: string } {
    const flags = [
      'vegan', 'vegetarian', 'gluten-free', 'gluten free', 'celiac',
      'nut allergy', 'allergy', 'asthma', 'knee', 'diabetes', 'pregnant'
    ];
  
    const found: string[] = [];
    let cleanText = text;
  
    for (const flag of flags) {
      const reg = new RegExp(`\\b${flag}\\b`, 'gi');
      if (reg.test(cleanText)) {
        found.push(flag);
        cleanText = cleanText.replace(reg, ' ');
      }
    }
  
    return { notes: found, cleanText: cleanText.trim() };
  }
  
  function sanitizeName(text: string): string {
    return text
      .replace(/^[\s\d\-•.)/]+/, '') // Strip leading numbers like "1.", "2)"
      .replace(/[,;:/()]/g, ' ')     // Strip punctuation
      .replace(/\b(?:eu|shoe|size|cm|kg)\b/gi, ' ') // Strip lingering unit tags
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * Parses raw comments and extracts candidates regardless of parameter order.
   */
  export function parseGuestsFromComment(rawComment: string): ParsedCandidate[] {
    if (!rawComment || typeof rawComment !== 'string') return [];
  
    // Split lines by newlines, semicolons, or numbered list indicators
    const lines = rawComment
      .split(/\n|;|\d+\.\s+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 2);
  
    const candidates: ParsedCandidate[] = [];
  
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (NON_GUEST_KEYWORDS.some((kw) => lower.includes(kw))) continue;
  
      let current = line;
  
      // 1. Extract Heights (e.g. 156cm, 184cm)
      const { heights, cleanText: textAfterHeights } = extractHeights(current);
      current = textAfterHeights;
  
      // 2. Extract Weights (e.g. 56kg)
      const { weights, cleanText: textAfterWeights } = extractWeights(current);
      current = textAfterWeights;
  
      // 3. Extract Shoe Sizes (e.g. EU34, EU31)
      const { sizes, cleanText: textAfterShoes } = extractBootSizes(current);
      current = textAfterShoes;
  
      // 4. Extract Medical & Dietary flags
      const { notes, cleanText: textAfterNotes } = extractMedicalNotes(current);
      current = textAfterNotes;
  
      // 5. Clean remaining letters to isolate the name
      const cleanName = sanitizeName(current);
  
      if (cleanName.length >= 2 && !/^\d+$/.test(cleanName)) {
        candidates.push({
          name: cleanName,
          bootSize: sizes[0] ?? '',
          // If two heights exist (e.g. ski length + body height), join them cleanly
          height: heights.join(' / '),
          weight: weights[0] ?? '',
          medicalNotes: notes.join(', '),
        });
      }
    }
  
    return candidates;
  }