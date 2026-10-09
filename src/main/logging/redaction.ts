const phonePattern = /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const identityPattern = /(?<!\d)(?:\d{15}|\d{17}[\dXx])(?!\d)/g
const authorizationPattern = /(authorization\s*:\s*(?:bearer|basic)\s+)[^\s,;]+/gi
const cookiePattern = /(cookie\s*:\s*)[^\r\n]+/gi
const secretAssignmentPattern =
  /((?:password|passwd|token|secret|access[_-]?key|refresh[_-]?token)\s*[=:]\s*)[^\s&;,]+/gi

export function redactLogText(value: string): string {
  return value
    .replace(authorizationPattern, '$1[已隐藏]')
    .replace(cookiePattern, '$1[已隐藏]')
    .replace(secretAssignmentPattern, '$1[已隐藏]')
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/gi, '$1?[已隐藏]')
    .replace(emailPattern, '[邮箱已隐藏]')
    .replace(identityPattern, '[证件号已隐藏]')
    .replace(phonePattern, '[手机号已隐藏]')
}
