# TRUGO — modifications classement

## Fichiers inclus
- `index.html` : bouton médailles à côté d'Amis et panneau de classements avec onglets Ligue/Médailles.
- `game.js` : affichage du compteur, classement local de ligues et médailles.
- `league-updates.css` : effets lumineux du bouton et styles du nouveau panneau.

Conserve aussi ton `style.css` original dans le même dossier que `index.html`, car il contient les styles principaux du jeu. Le CSS ajouté ici ne le remplace pas.

## Limite actuelle
Le classement affiche encore des joueurs de démonstration. Les comptes, mots de passe, amis et classements ne sont pas partagés entre appareils : le code actuel utilise `localStorage` et aucun backend n'est branché. Ne publie jamais de mots de passe en clair ni de clés secrètes dans le JavaScript du navigateur.

## Créer une base PostgreSQL sur Render
1. Ouvre le tableau de bord Render et choisis **New + → PostgreSQL**.
2. Donne un nom à la base et choisis la région correspondant à ton service web. Crée la base.
3. Dans la page de la base, récupère l'URL de connexion **Internal Database URL** pour un backend hébergé sur Render. Ajoute-la dans **Web Service → Environment** sous la variable `DATABASE_URL`. Ne la mets jamais dans `index.html` ou `game.js`.
4. Un site HTML statique ne peut pas se connecter directement à PostgreSQL de façon sûre. Il faut un backend Node.js/Express qui utilise `DATABASE_URL`, vérifie les comptes et expose des routes d'API pour l'inscription, la connexion, la recherche de joueurs et les demandes d'amis.
5. Le backend doit hacher les mots de passe (par exemple avec `bcrypt`), utiliser des sessions sécurisées ou des jetons, valider les entrées et vérifier que seul le compte connecté peut accepter/refuser une demande d'ami.
6. Pour les vrais amis : stocker les utilisateurs dans `users` et les relations/demandes dans `friendships` avec des identifiants de compte, pas seulement des pseudos locaux.
7. Déployer le backend comme **Web Service** Render, installer les dépendances via `package.json`, configurer `DATABASE_URL` dans les variables d'environnement et faire appeler son URL HTTPS par le front-end.

## Dépendances
Pour les changements d'interface de ce ZIP : aucune dépendance npm supplémentaire. Three.js continue d'être chargé par CDN comme avant.
Pour les comptes et amis réellement en ligne : oui, il faudra un backend et des dépendances côté serveur (au minimum `express` et `pg`, plus une solution sûre de hachage de mot de passe et de session/authentification). Ce backend n'est pas inclus dans ce ZIP car il faut le déployer et le connecter à l'authentification existante avant de pouvoir prétendre que les comptes sont réellement partagés.
