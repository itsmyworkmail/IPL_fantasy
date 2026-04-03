export function formatSkillName(skill: string | undefined | null): string {
  if (!skill) return 'AR';
  
  const upperSkill = skill.toUpperCase();
  
  if (upperSkill.includes('BAT')) return 'BAT';
  if (upperSkill.includes('BOW') || upperSkill === 'BWL') return 'BWL';
  if (upperSkill.includes('WICKET') || upperSkill === 'WIC' || upperSkill === 'WK') return 'WK';
  
  return 'AR';
}
