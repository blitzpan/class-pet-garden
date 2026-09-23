import { createRouter, createWebHistory } from 'vue-router'
import Leaderboard from '@/views/Leaderboard.vue'
import PetGallery from '@/views/PetGallery.vue'
import StudentDetail from '@/views/StudentDetail.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'leaderboard', component: Leaderboard },
    { path: '/gallery', name: 'gallery', component: PetGallery },
    { path: '/student/:studentId', name: 'student', component: StudentDetail },
  ],
})

export default router
