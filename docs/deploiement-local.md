# Dockge personnalisé : construction et déploiement

Image : `ghcr.io/tomtom-16/dockge:mobile-v1`, plateforme `linux/amd64`.
La construction s'effectue sur le Mac avec Docker/Colima, sans GitHub Actions.

## Construire et publier depuis le Mac

Dans le dépôt :

```bash
npm run build:local
npm run publish:local
```

Le Dockerfile autonome `docker/Dockerfile.local` compile le frontend et le
healthcheck, exécute ESLint, TypeScript et les tests du nettoyage, puis assemble
les dépendances Linux avec Node 22. Aucun `npm install` sur macOS n'est nécessaire
pour cette construction. Les données, fichiers `.env` et dépendances locales
sont exclus par `docker/Dockerfile.local.dockerignore`.

La publication sélectionne explicitement le manifeste AMD64. Si GHCR demande
une connexion, utiliser un jeton GitHub classique avec `write:packages` comme
mot de passe de `docker login ghcr.io -u tomtom-16`. Saisir le jeton dans
l'invite du terminal, jamais dans le dépôt ni dans une conversation.

Un nouveau package GHCR est privé par défaut. Pour permettre le téléchargement
sans authentification, ouvrir les paramètres du package sur GitHub et choisir
la visibilité publique. Pour le conserver privé, connecter également Docker
à GHCR dans le conteneur Proxmox 100 avec un jeton classique `read:packages`.

## Déployer dans Proxmox

Depuis le Mac :

```bash
ssh root@192.168.1.57
```

Sur Proxmox :

```bash
pct enter 100
cd /opt/dockge
```

Si le package est privé, se connecter une fois au registre avant le pull :

```bash
docker login ghcr.io -u tomtom-16
```

Télécharger l'image avant d'interrompre Dockge :

```bash
docker pull ghcr.io/tomtom-16/dockge:mobile-v1
```

Sauvegarder la configuration, arrêter uniquement Dockge et copier sa base au
repos. Les noms ci-dessous servent aussi au retour arrière : ne pas écraser
une sauvegarde précédente sans la conserver ailleurs.

```bash
cp -a compose.yaml compose.yaml.before-mobile-v1
docker compose stop dockge
tar -czf dockge-data-before-mobile-v1.tar.gz data
```

Changer uniquement la référence d'image dans le Compose existant :

```bash
sed -i 's|image: louislam/dockge:1|image: ghcr.io/tomtom-16/dockge:mobile-v1|' compose.yaml
docker compose config --quiet
docker compose up -d --no-deps dockge
docker compose ps
docker compose logs --tail=80 dockge
```

Les ports, le socket Docker et les montages `./data:/app/data` et
`/opt/stacks:/opt/stacks` restent ceux de la configuration existante. Aucun
`docker compose down` n'est nécessaire. L'arrêt de Dockge n'arrête pas les
conteneurs des stacks qu'il gère.

Recharger Dockge dans Safari. Sur mobile, le bouton Stacks ouvre la liste ; une
sélection la replie. « Voir les logs » mène au terminal. Le nettoyage des images
se trouve sur l'accueil. Il cible un seul hôte et demande confirmation ; les
agents distants doivent également disposer de cette version pour le prendre
en charge. Le mode standard retire les images dangling ; le mode étendu retire
aussi les images avec tag sans conteneur associé. Aucun volume, réseau ou
conteneur n'est supprimé par cette fonction.

## Retour à l'image précédente

Dans `/opt/dockge`, dans le conteneur 100 :

```bash
cp -a compose.yaml.before-mobile-v1 compose.yaml
docker compose up -d --no-deps dockge
docker compose ps
```

Cette modification n'ajoute aucune migration de base. La sauvegarde des données
reste disponible si une restauration est nécessaire.
