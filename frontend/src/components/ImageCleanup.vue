<template>
    <section class="shadow-box big-padding mt-4">
        <h2>{{ $t("imageCleanup") }}</h2>
        <p>{{ $t("imageCleanupDescription") }}</p>
        <label for="cleanup-host" class="form-label">{{ $t("dockgeAgent") }}</label>
        <select id="cleanup-host" v-model="endpoint" class="form-select mb-3" :disabled="processing">
            <option v-for="(agent, key) in $root.agentList" :key="key" :value="key" :disabled="$root.agentStatusList[key] !== 'online'">
                {{ agent.name || key || $t("Current") }}
            </option>
        </select>
        <div class="form-check mb-3">
            <input id="cleanup-all" v-model="all" class="form-check-input" type="checkbox" :disabled="processing">
            <label for="cleanup-all" class="form-check-label">{{ $t("imageCleanupAll") }}</label>
        </div>
        <p v-if="all" class="text-warning">{{ $t("imageCleanupAllWarning") }}</p>
        <button class="btn btn-warning" :disabled="processing || !hostOnline" @click="$refs.confirm.show()">
            {{ $t(processing ? "imageCleanupRunning" : "imageCleanup") }}
        </button>
        <p v-if="processing" class="mt-3" role="status">{{ $t("imageCleanupRunning") }} · {{ runningHost }}</p>
        <div v-if="result" class="mt-3" role="status">
            <p>{{ resultHost }}</p>
            <pre class="cleanup-output" :class="{ 'text-danger': failed }">{{ result }}</pre>
        </div>
        <Confirm ref="confirm" :title="$t('imageCleanup')" :yes-text="$t('imageCleanup')" :no-text="$t('cancel')" btn-style="btn-warning" @yes="cleanup">
            <p>{{ $t("imageCleanupConfirm", { host: hostLabel }) }}</p>
            <p>{{ $t(all ? "imageCleanupAllWarning" : "imageCleanupDescription") }}</p>
            <p>{{ $t("imageCleanupPreserves") }}</p>
        </Confirm>
    </section>
</template>

<script>
import Confirm from "./Confirm.vue";

export default {
    components: { Confirm },
    data() {
        return {
            endpoint: "",
            all: false,
            processing: false,
            result: "",
            failed: false,
            resultHost: "",
            runningHost: "",
        };
    },
    computed: {
        hostLabel() {
            return this.$root.agentList[this.endpoint]?.name || this.endpoint || this.$t("Current");
        },
        hostOnline() {
            return this.$root.agentStatusList[this.endpoint] === "online";
        },
    },
    methods: {
        /** Run the confirmed cleanup on exactly one authenticated endpoint. */
        cleanup() {
            if (this.processing || !this.hostOnline) {
                return;
            }
            this.processing = true;
            this.result = "";
            this.runningHost = this.hostLabel;
            this.$root.getSocket().timeout(16 * 60 * 1000).emit("agent", this.endpoint, "pruneImages", this.all, (error, res) => {
                this.processing = false;
                this.resultHost = this.runningHost;
                this.failed = Boolean(error) || !res.ok;
                this.result = error ? this.$t("imageCleanupNoResponse") : res.ok ? res.output || this.$t("imageCleanupDone") : res.msg;
            });
        },
    },
};
</script>

<style scoped>
.cleanup-output {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 20rem;
    overflow-y: auto;
}
</style>
