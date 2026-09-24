// 宠物 ID 白名单，需与 admin/src/data/pets.ts、nest/src/data/pets.ts 保持一致
const NORMAL_PET_IDS = new Set([
  'west-highland',
  'bichon',
  'border-collie',
  'shiba',
  'golden-retriever',
  'samoyed',
  'husky',
  'tabby-cat',
  'persian-cat',
  'ragdoll-cat',
  'orange-cat',
  'lop-rabbit',
  'angora-rabbit',
  'hamster',
  'winter-hamster',
  'call-duck',
  'alpaca',
  'red-panda',
  'corgi',
])

const MYTHICAL_PET_IDS = new Set([
  'white-tiger',
  'unicorn',
  'azure-dragon',
  'vermilion-bird',
  'succulent-spirit',
  'pixiu',
  'suanni',
])

export const VALID_PET_IDS = new Set([...NORMAL_PET_IDS, ...MYTHICAL_PET_IDS])

export function isMythicalPet(petType) {
  return MYTHICAL_PET_IDS.has(petType)
}

export function isValidPetType(petType) {
  return VALID_PET_IDS.has(petType)
}
