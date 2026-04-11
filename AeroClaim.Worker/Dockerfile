FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["AeroClaim.Worker/AeroClaim.Worker.csproj", "AeroClaim.Worker/"]
RUN dotnet restore "AeroClaim.Worker/AeroClaim.Worker.csproj"
COPY . .
WORKDIR "/src/AeroClaim.Worker"
RUN dotnet publish "AeroClaim.Worker.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "AeroClaim.Worker.dll"]
