import { createRouter, createWebHistory } from 'vue-router'
import Leaderboard from '@/views/Leaderboard.vue'
import PetGallery from '@/views/PetGallery.vue'
import StudentDetail from '@/views/StudentDetail.vue'
import SharePage from '@/views/SharePage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'leaderboard', component: Leaderboard },
    { path: '/gallery', name: 'gallery', component: PetGallery },
    { path: '/student/:studentId', name: 'student', component: StudentDetail },
    // 分享页：对外展示的成长卡，任何人打开都能看（公开接口，无需登录）
    { path: '/share/:studentId', name: 'share', component: SharePage },
  ],
})

export default router
