<script setup lang="ts">
defineProps<{ predator?: boolean }>()
</script>

<template>
  <svg viewBox="-30 -23 60 46" aria-hidden="true">
    <g v-if="predator">
      <path
        d="M-10-2Q-16-3-21-8C-25-10-27-7-24-3L-22 0-24 3C-27 7-25 10-21 8Q-16 3-10 2Z"
        fill="#c17a55"
      />
      <path d="M-7-7C-5-11-2-19 1-19Q4-19 2-15L6-7Z" fill="#bd7853" />
      <path d="M19-1C19-9 10-13 2-11-6-10-11-5-13 0-8 8 0 12 9 10 17 9 21 4 19-1Z" fill="#cc835b" />
      <path d="M-10 3Q5 9 19 2C17 9 7 12 0 9Z" fill="#f2d7aa" />
      <path d="M4 4C2 8-1 12-4 11Q-8 9-2 3Z" fill="#d59468" />
      <path d="M17 3Q15 5 13 4" fill="none" stroke="#946345" stroke-width=".8" />
      <circle cx="10" cy="-3" r="4.2" fill="#fffbed" />
      <circle cx="10.8" cy="-3" r="2.5" fill="#294e43" />
      <circle cx="11.8" cy="-4.2" r=".85" fill="#fff" />
    </g>
    <g v-else>
      <path
        d="M-8-1Q-14-2-19-6C-23-8-25-5-22-2L-20 0-22 2C-25 5-23 8-19 6Q-14 2-8 1Z"
        fill="#8caf8b"
      />
      <path d="M-5-6Q0-14 4-11L5-5Z" fill="#7fa585" />
      <path d="M14 0C14-8 4-12-4-8L-12 0C-6 9 5 12 12 5Q15 3 14 0Z" fill="#729b7f" />
      <path d="M-8 3Q4 7 14 1C12 8 2 11-5 6Z" fill="#d9e2bb" />
      <path d="M3 4Q0 11-4 8Q-6 6 0 2Z" fill="#9db994" />
      <path d="M13 2Q11 4 9 3" fill="none" stroke="#567b5d" stroke-width=".8" />
      <circle cx="7" cy="-2.5" r="3.8" fill="#fffbed" />
      <circle cx="7.8" cy="-2.5" r="2.25" fill="#294e43" />
      <circle cx="8.6" cy="-3.5" r=".75" fill="#fff" />
    </g>
  </svg>
</template>
