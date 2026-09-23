<script setup lang="ts">
withDefaults(defineProps<{
  activePage: 'leaderboard' | 'gallery'
  eyebrow?: string
  title?: string
}>(), {
  eyebrow: 'PARENT PORTAL',
  title: '宠物花园',
})
</script>

<template>
  <div class="min-h-screen bg-[#fffaf5] font-sans text-[#38281f]">
    <header class="sticky top-0 z-40 border-b border-[#f1e5db] bg-[#fffdfb]/95 px-4 py-3 backdrop-blur transition-all duration-300 sm:px-6 lg:hidden">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <router-link :to="{ path: '/' }" class="flex min-w-0 items-center gap-2.5">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#ffe7c8] text-xl text-[#d97706]">🐾</span>
          <span class="min-w-0"><span class="block truncate font-serif text-lg font-bold text-[#422d20]">{{ title }}</span><span class="block truncate text-sm text-[#9a735d]">{{ eyebrow }}</span></span>
        </router-link>
        <router-link to="/gallery" class="flex h-10 items-center rounded-xl bg-[#fff1e6] px-3 text-sm font-semibold text-[#b85e25]">图鉴</router-link>
      </div>
    </header>

    <div class="mx-auto flex max-w-[1728px] gap-5 px-3 pb-3 pt-3 lg:px-5 lg:pb-5 lg:pt-5">
      <aside class="sticky top-3 hidden h-[calc(100vh-24px)] w-60 shrink-0 flex-col rounded-[1.75rem] border border-[#f1e5db] bg-[#fffdf9] p-4 shadow-[0_12px_36px_rgba(116,76,45,0.07)] transition-all duration-300 lg:top-5 lg:flex lg:h-[calc(100vh-40px)]">
        <router-link :to="{ path: '/' }" class="flex min-w-0 items-center gap-3 px-2 py-2">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#ffe7c8] text-[#d97706] shadow-sm"><span class="material-symbols-rounded text-[24px]">pets</span></span>
          <span class="min-w-0 flex-1"><span class="block truncate font-serif text-xl font-bold text-[#422d20]">{{ title }}</span><span class="mt-0.5 block truncate text-sm font-semibold leading-none tracking-[0.05em] text-[#b58b70]">{{ eyebrow }}</span></span>
        </router-link>

        <nav class="mt-5 space-y-1.5" aria-label="主导航">
          <router-link to="/" class="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition" :class="activePage === 'leaderboard' ? 'bg-[#fff0e2] text-[#b85e25] shadow-[inset_0_0_0_1px_rgba(234,151,86,0.18)]' : 'text-[#765f50] hover:bg-[#fff7f1] hover:text-[#b85e25]'"><span class="material-symbols-rounded text-[20px] leading-none">emoji_events</span>排行榜</router-link>
          <router-link to="/gallery" class="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition" :class="activePage === 'gallery' ? 'bg-[#fff0e2] text-[#b85e25] shadow-[inset_0_0_0_1px_rgba(234,151,86,0.18)]' : 'text-[#765f50] hover:bg-[#fff7f1] hover:text-[#b85e25]'"><span class="material-symbols-rounded text-[20px] leading-none">pets</span>图鉴</router-link>
        </nav>

        <p class="mt-auto rounded-2xl bg-[#fff3e8] px-3 py-3 text-sm leading-5 text-[#9a5a2b]">
          每一次进步，都在被看见。
        </p>
      </aside>

      <div class="min-w-0 flex-1 pb-20 lg:pb-0">
        <slot />
      </div>
    </div>

    <nav class="fixed inset-x-3 bottom-3 z-40 grid grid-cols-2 rounded-2xl border border-[#f1e5db] bg-white/95 p-1.5 shadow-[0_12px_36px_rgba(116,76,45,0.16)] backdrop-blur transition-all duration-300 lg:hidden" aria-label="移动导航">
      <router-link to="/" class="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-sm font-semibold leading-tight" :class="activePage === 'leaderboard' ? 'bg-[#fff0e2] text-[#b85e25]' : 'text-[#8c7464]'"><span class="material-symbols-rounded text-[18px] leading-none">emoji_events</span>排行榜</router-link>
      <router-link to="/gallery" class="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-sm font-semibold leading-tight" :class="activePage === 'gallery' ? 'bg-[#fff0e2] text-[#b85e25]' : 'text-[#8c7464]'"><span class="material-symbols-rounded text-[18px] leading-none">pets</span>图鉴</router-link>
    </nav>
  </div>
</template>
