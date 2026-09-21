import { createRouter, createWebHistory } from 'vue-router'
import Leaderboard from '@/views/Leaderboard.vue'
import StudentDetail from '@/views/StudentDetail.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'leaderboard', component: Leaderboard },
    { path: '/student/:studentId', name: 'student', component: StudentDetail },
  ],
})

export default router
