<template>
    <div>
        <div class="stats">
            <div class="stat">
                <div class="stat-label">
                    {{ $t('CPU') }}
                </div>
                <div :title="stat.CPUPerc">
                    {{ stat.CPUPerc || "—" }}
                </div>
            </div>
            <div class="stat">
                <div class="stat-label">
                    {{ $t('memory') }}
                </div>
                <div :title="memoryUsage">
                    {{ memoryUsage }}
                </div>
            </div>
            <div class="stat">
                <div class="stat-label">
                    {{ $t('networkIO') }}
                </div>
                <div :title="stat.NetIO">
                    {{ stat.NetIO || "—" }}
                </div>
            </div>
            <div class="stat">
                <div class="stat-label">
                    {{ $t('blockIO') }}
                </div>
                <div :title="stat.BlockIO">
                    {{ stat.BlockIO || "—" }}
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    props: {
        stat: {
            type: Object,
            required: true
        }
    },
    computed: {
        memoryUsage() {
            if (!this.stat.MemUsage) {
                return "—";
            }
            return this.stat.MemPerc ? `${this.stat.MemUsage} (${this.stat.MemPerc})` : this.stat.MemUsage;
        }
    }
};
</script>

<style lang="scss" scoped>
.stats {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) repeat(3, minmax(0, max-content));
    justify-content: space-between;
    column-gap: 12px;
    font-size: 0.8rem;
    color: #6c757d;
    font-variant-numeric: tabular-nums;
}

.stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;

    > div {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.stat-label {
    font-weight: bold;
}

</style>
