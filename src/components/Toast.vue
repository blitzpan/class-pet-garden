<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Props {
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  duration: 3000
})

const visible = ref(false)

const icons = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️'
}

const colors = {
  success: 'from-green-400 via-emerald-500 to-teal-500',
  error: 'from-red-400 via-rose-500 to-pink-500',
  warning: 'from-amber-400 via-orange-500 to-yellow-500',
  info: 'from-blue-400 via-cyan-500 to-sky-500'
}

const ringColors = {
  success: 'border-emerald-300',
  error: 'border-red-300',
  warning: 'border-amber-300',
  info: 'border-blue-300'
}

onMounted(() => {
  visible.value = true
  setTimeout(() => {
    visible.value = false
  }, props.duration)
})
</script>

<template>
  <Transition name="toast">
    <div
      v-if="visible"
      class="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
    >
      <div
        class="relative toast-card px-10 py-8 rounded-3xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.45)] text-white text-center min-w-[380px] max-w-[560px]"
        :class="`bg-gradient-to-br ${colors[props.type]}`"
      >
        <div
          class="absolute -inset-2 rounded-[28px] border-4 opacity-60 toast-pulse-ring"
          :class="ringColors[props.type]"
        />
        <div
          class="absolute -inset-2 rounded-[28px] border-4 opacity-60 toast-pulse-ring toast-pulse-ring-delay"
          :class="ringColors[props.type]"
        />

        <div class="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <div class="toast-shimmer absolute inset-0" />
        </div>

        <div class="relative flex flex-col items-center gap-4">
          <span class="text-6xl toast-icon">{{ icons[props.type] }}</span>
          <p class="text-2xl font-bold leading-snug tracking-wide toast-text">{{ message }}</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toast-enter-active {
  transition: opacity 0.4s ease;
}

.toast-enter-active .toast-card {
  animation: toast-bounce-in 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.toast-leave-active {
  transition: opacity 0.5s ease;
}

.toast-leave-active .toast-card {
  animation: toast-bounce-out 0.5s ease forwards;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
}

@keyframes toast-bounce-in {
  0% {
    transform: scale(0.35) translateY(40px);
    opacity: 0;
  }
  55% {
    transform: scale(1.1) translateY(-10px);
    opacity: 1;
  }
  75% {
    transform: scale(0.95) translateY(4px);
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

@keyframes toast-bounce-out {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(0.55) translateY(40px);
    opacity: 0;
  }
}

.toast-pulse-ring {
  animation: toast-pulse-ring 1.6s ease-out infinite;
}

.toast-pulse-ring-delay {
  animation-delay: 0.8s;
}

@keyframes toast-pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.55;
  }
  100% {
    transform: scale(1.3);
    opacity: 0;
  }
}

.toast-shimmer {
  background: linear-gradient(
    105deg,
    transparent 40%,
    rgba(255, 255, 255, 0.35) 50%,
    transparent 60%
  );
  animation: toast-shimmer 2.2s ease-in-out infinite;
}

@keyframes toast-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.toast-icon {
  animation: toast-icon-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.12s both;
}

@keyframes toast-icon-pop {
  0% {
    transform: scale(0) rotate(-24deg);
  }
  70% {
    transform: scale(1.25) rotate(6deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}

.toast-text {
  animation: toast-text-fade 0.5s ease 0.22s both;
}

@keyframes toast-text-fade {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
