<template>
  <v-list class="pt-2" flat>
    <TpgDevice
      v-for="TpgDevice in TpgDevices"
      :key="TpgDevice.id"
      :TpgDevice="TpgDevice"
    />
  </v-list>
</template>
<script>
import TpgDevice from "./TpgDevice.vue";

export default {
  computed: {
    TpgDevices: {
      get() {
        return this.$store.getters.devicesFiltered;
      },
      set(value) {
        this.$store.dispatch("setDevices", value);
      },
    },
  },
  created() {},
  methods: {},
  components: {
    TpgDevice: require("@/components/Todo/TpgDevice.vue").default,
  },
};
</script>