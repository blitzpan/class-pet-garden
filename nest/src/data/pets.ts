export interface PetType {
  id: string
  name: string
  mythical?: boolean
}

export const PET_TYPES: PetType[] = [
  { id: 'cat', name: '小猫' },
  { id: 'dog', name: '小狗' },
  { id: 'rabbit', name: '小兔' },
  { id: 'panda', name: '熊猫' },
  { id: 'frog', name: '青蛙' },
  { id: 'turtle', name: '乌龟' },
  { id: 'fox', name: '小狐狸' },
  { id: 'bear', name: '小熊' },
  { id: 'bird', name: '小鸟' },
  { id: 'white-tiger', name: '白老虎（神兽）', mythical: true },
  { id: 'unicorn', name: '独角兽（神兽）', mythical: true },
  { id: 'azure-dragon', name: '青龙（神兽）', mythical: true },
]
