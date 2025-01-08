<template>
  <v-app id="inspire">
    <v-navigation-drawer
      v-model="drawer"
      :mobile-breakpoint="768"
      color="deep-purple"
      app
    >
      <v-container>
        <v-row>
          <v-col align="center">
            <v-avatar size="70" class="mb-2">
              <img
                src="https://www.gravatar.com/avatar/7fc435a39d646917a2bec07f5dfea1d4?s=160"
                alt="Ron Redmer"
              />
            </v-avatar>
            <div class="white--text text-subtitle-1 font-weight-bold">
              Ron Redmer
            </div>
            <div class="white--text text-subtitle-2">Administrator</div>
          </v-col>
        </v-row>
      </v-container>
      <v-list dense nav>
        <v-list-item
          v-for="item in items"
          :key="item.title"
          :to="item.to"
          dark
          link
        >
          <v-list-item-icon>
            <v-icon>{{ item.icon }}</v-icon>
          </v-list-item-icon>

          <v-list-item-content>
            <v-list-item-title>{{ item.title }}</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar app color="deep-purple" dark prominent :height="170">
      <v-container class="header-container pa-0">
        <v-row>
          <v-app-bar-nav-icon @click="drawer = !drawer"></v-app-bar-nav-icon>
        </v-row>
        <v-row>
          <v-toolbar-title class="text-h4 ml-4">
            {{ $store.state.appTitle }}
          </v-toolbar-title>
        </v-row>
        <v-row>
          <live-date-time />
        </v-row>
      </v-container>
    </v-app-bar>

    <v-main>
      <router-view></router-view>
      <snackbar />
    </v-main>
  </v-app>
</template>

<script>
export default {
  data: () => ({
    drawer: null,
    items: [
      { title: "WebHub", icon: "mdi-format-list-checks", to: "/" },
      { title: "About", icon: "mdi-help-box", to: "/about" },
    ],
  }),
  mounted() {
    this.$store.dispatch("getDevices");
  },
  components: {
    "live-date-time": require("@/components/Tools/LiveDateTime.vue").default,
    snackbar: require("@/components/Shared/Snackbar.vue").default,
  },
};
</script>

<style lang="sass">
.header-container
  max-width: none
</style>